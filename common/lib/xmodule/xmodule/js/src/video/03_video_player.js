(function (requirejs, require, define) {

// VideoPlayer module.
define(
'video/03_video_player.js',
['video/02_html5_video.js', 'video/00_resizer.js' ],
function (HTML5Video, Resizer) {

    // VideoPlayer() function - what this module "exports".
    return function (state) {
        state.videoPlayer = {};

        _makeFunctionsPublic(state);
        _initialize(state);
        // No callbacks to DOM events (click, mousemove, etc.).
    };

    // ***************************************************************
    // Private functions start here.
    // ***************************************************************

    // function _makeFunctionsPublic(state)
    //
    //     Functions which will be accessible via 'state' object. When called,
    //     these functions will get the 'state' object as a context.
    function _makeFunctionsPublic(state) {
        var methodsList = [
            pause, play, update, onSpeedChange, onEnded, onPause, onPlay,
            onUnstarted, handlePlaybackQualityChange, onPlaybackQualityChange,
            onStateChange, onReady, updatePlayTime, isPlaying, log, duration,
            onVolumeChange
        ];

        state.videoPlayer.onCaptionSeek = _.bind(onSeek, state);
        state.videoPlayer.onSlideSeek   = _.bind(onSeek, state);

        state.bindTo(methodsList, state.videoPlayer, state);
    }

    // function _initialize(state)
    //
    //     Create any necessary DOM elements, attach them, and set their
    //     initial configuration. Also make the created DOM elements available
    //     via the 'state' object. Much easier to work this way - you don't
    //     have to do repeated jQuery element selects.
    function _initialize(state) {
        var youTubeId;

        // The function is called just once to apply pre-defined configurations
        // by student before video starts playing. Waits until the video's
        // metadata is loaded, which normally happens just after the video
        // starts playing. Just after that configurations can be applied.
        state.videoPlayer.ready = _.once(function () {
            if (state.currentPlayerMode !== 'flash') {
                state.videoPlayer.onSpeedChange(state.speed);
            }
        });

        if (state.videoType === 'youtube') {
            state.videoPlayer.PlayerState = YT.PlayerState;
            state.videoPlayer.PlayerState.UNSTARTED = -1;
        } else { // if (state.videoType === 'html5') {
            state.videoPlayer.PlayerState = HTML5Video.PlayerState;
        }

        state.videoPlayer.currentTime = 0;

        state.videoPlayer.initialSeekToStartTime = true;

        state.videoPlayer.oneTimePauseAtEndTime = true;

        // The initial value of the variable `seekToStartTimeOldSpeed`
        // should always differ from the value returned by the duration
        // function.
        state.videoPlayer.seekToStartTimeOldSpeed = 'void';

        state.videoPlayer.playerVars = {
            controls: 0,
            wmode: 'transparent',
            rel: 0,
            showinfo: 0,
            enablejsapi: 1,
            modestbranding: 1
        };

        if (state.currentPlayerMode !== 'flash') {
            state.videoPlayer.playerVars.html5 = 1;
        }

        // There is a bug which prevents YouTube API to correctly set the speed
        // to 1.0 from another speed in Firefox when in HTML5 mode. There is a
        // fix which basically reloads the video at speed 1.0 when this change
        // is requested (instead of simply requesting a speed change to 1.0).
        // This has to be done only when the video is being watched in Firefox.
        // We need to figure out what browser is currently executing this code.
        //
        // TODO: Check the status of
        // http://code.google.com/p/gdata-issues/issues/detail?id=4654
        // When the YouTube team fixes the API bug, we can remove this
        // temporary bug fix.
        state.browserIsFirefox = navigator.userAgent
            .toLowerCase().indexOf('firefox') > -1;

        if (state.videoType === 'html5') {
            state.videoPlayer.player = new HTML5Video.Player(state.el, {
                playerVars:   state.videoPlayer.playerVars,
                videoSources: state.html5Sources,
                events: {
                    onReady:       state.videoPlayer.onReady,
                    onStateChange: state.videoPlayer.onStateChange
                }
            });
        } else { // if (state.videoType === 'youtube') {
            if (state.currentPlayerMode === 'flash') {
                youTubeId = state.youtubeId();
            } else {
                youTubeId = state.youtubeId('1.0');
            }
            state.videoPlayer.player = new YT.Player(state.id, {
                playerVars: state.videoPlayer.playerVars,
                videoId: youTubeId,
                events: {
                    onReady: state.videoPlayer.onReady,
                    onStateChange: state.videoPlayer.onStateChange,
                    onPlaybackQualityChange: state.videoPlayer
                        .onPlaybackQualityChange
                }
            });
        }
    }

    // function _restartUsingFlash(state)
    //
    //     When we are about to play a YouTube video in HTML5 mode and discover
    //     that we only have one available playback rate, we will switch to
    //     Flash mode. In Flash speed switching is done by reloading videos
    //     recorded at different frame rates.
    function _restartUsingFlash(state) {
        // Remove from the page current iFrame with HTML5 video.
        state.videoPlayer.player.destroy();

        state.currentPlayerMode = 'flash';

        console.log('[Video info]: Changing YouTube player mode to "flash".');

        // Removed configuration option that requests the HTML5 mode.
        delete state.videoPlayer.playerVars.html5;

        // Request for the creation of a new Flash player
        state.videoPlayer.player = new YT.Player(state.id, {
            playerVars: state.videoPlayer.playerVars,
            videoId: state.youtubeId(),
            events: {
                onReady: state.videoPlayer.onReady,
                onStateChange: state.videoPlayer.onStateChange,
                onPlaybackQualityChange: state.videoPlayer
                    .onPlaybackQualityChange
            }
        });
    }

    // ***************************************************************
    // Public functions start here.
    // These are available via the 'state' object. Their context ('this'
    // keyword) is the 'state' object. The magic private function that makes
    // them available and sets up their context is makeFunctionsPublic().
    // ***************************************************************

    function pause() {
        if (this.videoPlayer.player.pauseVideo) {
            this.videoPlayer.player.pauseVideo();
        }
    }

    function play() {
        if (this.videoPlayer.player.playVideo) {
            this.videoPlayer.player.playVideo();
        }
    }

    // This function gets the video's current play position in time
    // (currentTime) and its duration.
    // It is called at a regular interval when the video is playing (see
    // below).
    function update() {
        this.videoPlayer.currentTime = this.videoPlayer.player
            .getCurrentTime();

        if (isFinite(this.videoPlayer.currentTime)) {
            this.videoPlayer.updatePlayTime(this.videoPlayer.currentTime);

            // We need to pause the video is current time is smaller (or equal)
            // than end time. Also, we must make sure that the end time is the
            // one that was set in the configuration parameter. If it differs,
            // this means that it was either reset to the end, or the duration
            // changed it's value.
            //
            // In the case of YouTube Flash mode, we must remember that the
            // start and end times are rescaled based on the current speed of
            // the video.
            if (
                this.videoPlayer.endTime <= this.videoPlayer.currentTime &&
                this.videoPlayer.oneTimePauseAtEndTime
            ) {
                this.videoPlayer.oneTimePauseAtEndTime = false;
                this.videoPlayer.pause();
                this.videoPlayer.endTime = this.videoPlayer.duration();
            }
        }
    }

    function onSpeedChange(newSpeed, updateCookie) {
        var time = this.videoPlayer.currentTime,
            methodName, youtubeId;

        if (this.currentPlayerMode === 'flash') {
            this.videoPlayer.currentTime = Time.convert(
                time,
                parseFloat(this.speed),
                newSpeed
            );
        }

        newSpeed = parseFloat(newSpeed).toFixed(2).replace(/\.00$/, '.0');

        this.videoPlayer.log(
            'speed_change_video',
            {
                current_time: time,
                old_speed: this.speed,
                new_speed: newSpeed
            }
        );

        this.setSpeed(newSpeed, updateCookie);

        if (
            this.currentPlayerMode === 'html5' &&
            !(
                this.browserIsFirefox &&
                newSpeed === '1.0' &&
                this.videoType === 'youtube'
            )
        ) {
            this.videoPlayer.player.setPlaybackRate(newSpeed);
        } else {
            // We request the reloading of the video in the case when YouTube
            // is in Flash player mode, or when we are in Firefox, and the new
            // speed is 1.0. The second case is necessary to avoid the bug
            // where in Firefox speed switching to 1.0 in HTML5 player mode is
            // handled incorrectly by YouTube API.
            methodName = "cueVideoById";
            youtubeId = this.youtubeId();

            if (this.videoPlayer.isPlaying()) {
                methodName = "loadVideoById";
            }

            this.videoPlayer.player[methodName](youtubeId, time);
            this.videoPlayer.updatePlayTime(time);
        }
    }

    // Every 200 ms, if the video is playing, we call the function update, via
    // clearInterval. This interval is called updateInterval.
    // It is created on a onPlay event. Cleared on a onPause event.
    // Reinitialized on a onSeek event.
    function onSeek(params) {
        var duration = this.videoPlayer.duration(),
            newTime = params.time;

        if (
            (typeof newTime !== 'number') ||
            (newTime > duration) ||
            (newTime < 0)
        ) {
            return;
        }

        this.videoPlayer.log(
            'seek_video',
            {
                old_time: this.videoPlayer.currentTime,
                new_time: newTime,
                type: params.type
            }
        );

        this.videoPlayer.startTime = 0;
        this.videoPlayer.endTime = duration;

        this.videoPlayer.player.seekTo(newTime, true);

        if (this.videoPlayer.isPlaying()) {
            clearInterval(this.videoPlayer.updateInterval);
            this.videoPlayer.updateInterval = setInterval(
                this.videoPlayer.update, 200
            );

            setTimeout(this.videoPlayer.update, 0);
        } else {
            this.videoPlayer.currentTime = newTime;
        }

        this.videoPlayer.updatePlayTime(newTime);
    }

    function onEnded() {
        var time = this.videoPlayer.duration();

        this.trigger('videoControl.pause', null);

        if (this.config.show_captions) {
            this.trigger('videoCaption.pause', null);
        }

        // Sometimes `onEnded` events fires when `currentTime` not equal
        // `duration`. In this case, slider doesn't reach the end point of
        // timeline.
        this.videoPlayer.updatePlayTime(time);
    }

    function onPause() {
        this.videoPlayer.log(
            'pause_video',
            {
                'currentTime': this.videoPlayer.currentTime
            }
        );

        clearInterval(this.videoPlayer.updateInterval);
        delete this.videoPlayer.updateInterval;

        this.trigger('videoControl.pause', null);

        if (this.config.show_captions) {
            this.trigger('videoCaption.pause', null);
        }
    }

    function onPlay() {
        this.videoPlayer.log(
            'play_video',
            {
                'currentTime': this.videoPlayer.currentTime
            }
        );

        if (!this.videoPlayer.updateInterval) {
            this.videoPlayer.updateInterval = setInterval(
                this.videoPlayer.update, 200
            );

            this.videoPlayer.update();
        }

        this.trigger('videoControl.play', null);

        if (this.config.show_captions) {
            this.trigger('videoCaption.play', null);
        }

        this.videoPlayer.ready();
    }

    function onUnstarted() { }

    function handlePlaybackQualityChange(value) {
        this.videoPlayer.player.setPlaybackQuality(value);
    }

    function onPlaybackQualityChange() {
        var quality;

        quality = this.videoPlayer.player.getPlaybackQuality();

        this.trigger('videoQualityControl.onQualityChange', quality);
    }

    function onReady() {
        var availablePlaybackRates, baseSpeedSubs, _this,
            player, videoWidth, videoHeight;

        this.videoPlayer.log('load_video');

        availablePlaybackRates = this.videoPlayer.player
                                    .getAvailablePlaybackRates();

        // Because of problems with muting sound outside of range 0.25 and
        // 5.0, we should filter our available playback rates.
        // Issues:
        //   https://code.google.com/p/chromium/issues/detail?id=264341
        //   https://bugzilla.mozilla.org/show_bug.cgi?id=840745
        //   https://developer.mozilla.org/en-US/docs/DOM/HTMLMediaElement

        availablePlaybackRates = _.filter(
            availablePlaybackRates,
            function (item) {
                var speed = Number(item);
                return speed > 0.25 && speed <= 5;
            }
        );

        if (
            this.currentPlayerMode === 'html5' &&
            this.videoType === 'youtube'
        ) {
            if (availablePlaybackRates.length === 1) {
                // This condition is needed in cases when Firefox version is
                // less than 20. In those versions HTML5 playback could only
                // happen at 1 speed (no speed changing). Therefore, in this
                // case, we need to switch back to Flash.
                //
                // This might also happen in other browsers, therefore when we
                // have 1 speed available, we fall back to Flash.

                _restartUsingFlash(this);

                return;
            } else if (availablePlaybackRates.length > 1) {
                // We need to synchronize available frame rates with the ones
                // that the user specified.

                baseSpeedSubs = this.videos['1.0'];
                _this = this;
                // this.videos is a dictionary containing various frame rates
                // and their associated subs.

                // First clear the dictionary.
                $.each(this.videos, function (index, value) {
                    delete _this.videos[index];
                });
                this.speeds = [];
                // Recreate it with the supplied frame rates.
                $.each(availablePlaybackRates, function (index, value) {
                    var key = value.toFixed(2).replace(/\.00$/, '.0');

                    _this.videos[key] = baseSpeedSubs;

                    _this.speeds.push(key);
                });

                this.trigger(
                    'videoSpeedControl.reRender',
                    {
                        newSpeeds: this.speeds,
                        currentSpeed: this.speed
                    }
                );

                this.setSpeed($.cookie('video_speed'));
            }
        }

        if (this.currentPlayerMode === 'html5') {
            this.videoPlayer.player.setPlaybackRate(this.speed);
        }

        if (this.videoType === 'html5') {
            player = this.videoEl = this.videoPlayer.player.videoEl;
            videoWidth = player[0].videoWidth || player.width();
            videoHeight = player[0].videoHeight || player.height();
        } else {
            player = this.videoEl = this.el.find('iframe');
            videoWidth = player.attr('width') || player.width();
            videoHeight = player.attr('height') || player.height();
        }

        this.resizer = new Resizer({
                element: this.videoEl,
                elementRatio: videoWidth/videoHeight,
                container: this.videoEl.parent()
            })
            .setMode('width');

        this.trigger('videoCaption.resize', null);
        $(window).bind('resize', _.debounce(this.resizer.align, 100));


        /* The following has been commented out to make sure autoplay is
           disabled for students.
        if (
            !onTouchBasedDevice() &&
            $('.video:first').data('autoplay') === 'True'
        ) {
            this.videoPlayer.play();
        }
        */
    }

    function onStateChange(event) {
        switch (event.data) {
            case this.videoPlayer.PlayerState.UNSTARTED:
                this.videoPlayer.onUnstarted();
                break;
            case this.videoPlayer.PlayerState.PLAYING:
                this.videoPlayer.onPlay();
                break;
            case this.videoPlayer.PlayerState.PAUSED:
                this.videoPlayer.onPause();
                break;
            case this.videoPlayer.PlayerState.ENDED:
                this.videoPlayer.onEnded();
                break;
        }
    }

    function updatePlayTime(time) {
        var duration = this.videoPlayer.duration(),
            durationChange;

        if (
            duration > 0 &&
            (
                this.videoPlayer.seekToStartTimeOldSpeed !== this.speed ||
                this.videoPlayer.initialSeekToStartTime
            )
        ) {
            if (
                this.videoPlayer.seekToStartTimeOldSpeed !== this.speed &&
                this.videoPlayer.initialSeekToStartTime === false
            ) {
                durationChange = true;
            } else {
                durationChange = false;
            }

            this.videoPlayer.initialSeekToStartTime = false;
            this.videoPlayer.seekToStartTimeOldSpeed = this.speed;

            // We retrieve the original times. They could have been changed due
            // to the fact of speed change (duration change). This happens when
            // in YouTube Flash mode. There each speed is a different video,
            // with a different length.
            this.videoPlayer.startTime = this.config.startTime;
            this.videoPlayer.endTime = this.config.endTime;

            if (this.videoPlayer.startTime > duration) {
                this.videoPlayer.startTime = 0;
            } else {
                if (this.currentPlayerMode === 'flash') {
                    this.videoPlayer.startTime /= Number(this.speed);
                }
            }
            if (
                this.videoPlayer.endTime === null ||
                this.videoPlayer.endTime > duration
            ) {
                this.videoPlayer.endTime = duration;
            } else {
                if (this.currentPlayerMode === 'flash') {
                    this.videoPlayer.endTime /= Number(this.speed);
                }
            }

            // If this is not a duration change (if it is, we continue playing
            // from current time), then we need to seek the video to the start
            // time.
            //
            // We seek only if start time differs from zero.
            if (durationChange === false && this.videoPlayer.startTime > 0) {
                this.videoPlayer.player.seekTo(this.videoPlayer.startTime);
            }

            // Rebuild the slider start-end range (if it doesn't take up the
            // whole slider).
            if (!(
                this.videoPlayer.startTime === 0 &&
                this.videoPlayer.endTime === duration
            )) {
                this.trigger(
                    'videoProgressSlider.updateStartEndTimeRegion',
                    {
                        duration: duration
                    }
                );
            }
        }

        this.trigger(
            'videoProgressSlider.updatePlayTime',
            {
                time: time,
                duration: duration
            }
        );

        this.trigger(
            'videoControl.updateVcrVidTime',
            {
                time: time,
                duration: duration
            }
        );

        this.trigger('videoCaption.updatePlayTime', time);
    }

    function isPlaying() {
        var playerState = this.videoPlayer.player.getPlayerState(),
            PLAYING = this.videoPlayer.PlayerState.PLAYING;

        return playerState === PLAYING;
    }

    /*
     * Return the duration of the video in seconds.
     *
     * First, try to use the native player API call to get the duration.
     * If the value returned by the native function is not valid, resort to
     * the value stored in the metadata for the video. Note that the metadata
     * is available only for YouTube videos.
     *
     * IMPORTANT! It has been observed that sometimes, after initial playback
     * of the video, when operations "pause" and "play" are performed (in that
     * sequence), the function will start returning a slightly different value.
     *
     * For example: While playing for the first time, the function returns 31.
     * After pausing the video and then resuming once more, the function will
     * start returning 31.950656.
     *
     * This instability is internal to the player API (or browser internals).
     */
    function duration() {
        var dur = this.videoPlayer.player.getDuration();

        if (!isFinite(dur)) {
            dur = this.getDuration();
        }

        return Math.floor(dur);
    }

    function log(eventName, data) {
        var logInfo;

        // Default parameters that always get logged.
        logInfo = {
            'id':   this.id,
            'code': this.youtubeId()
        };

        // If extra parameters were passed to the log.
        if (data) {
            $.each(data, function (paramName, value) {
                logInfo[paramName] = value;
            });
        }

        if (this.videoType === 'youtube') {
            logInfo.code = this.youtubeId();
        } else  if (this.videoType === 'html5') {
            logInfo.code = 'html5';
        }

        Logger.log(eventName, logInfo);
    }

    function onVolumeChange(volume) {
        this.videoPlayer.player.setVolume(volume);
    }
});

}(RequireJS.requirejs, RequireJS.require, RequireJS.define));
