from datetime import datetime
from pytz import UTC

from xblock.fields import Scope, Boolean, String, Float, XBlockMixin, Dict
from xmodule.fields import Date, Timedelta
from xblock.runtime import KeyValueStore


class InheritanceMixin(XBlockMixin):
    """Field definitions for inheritable fields"""

    graded = Boolean(
        help="Whether this module contributes to the final course grade",
        default=False,
        scope=Scope.settings
    )

    start = Date(
        help="Start time when this module is visible",
        default=datetime.fromtimestamp(0, UTC),
        scope=Scope.settings
    )
    due = Date(help="Date that this problem is due by", scope=Scope.settings)
    giturl = String(help="url root for course data git repository", scope=Scope.settings)
    xqa_key = String(help="DO NOT USE", scope=Scope.settings)
    graceperiod = Timedelta(
        help="Amount of time after the due date that submissions will be accepted",
        scope=Scope.settings
    )
    showanswer = String(
        help="When to show the problem answer to the student",
        scope=Scope.settings,
        default="finished"
    )
    rerandomize = String(
        help="When to rerandomize the problem",
        default="never",
        scope=Scope.settings
    )
    days_early_for_beta = Float(
        help="Number of days early to show content to beta users",
        default=None,
        scope=Scope.settings
    )
    static_asset_path = String(help="Path to use for static assets - overrides Studio c4x://", scope=Scope.settings, default='')
    text_customization = Dict(
        help="String customization substitutions for particular locations",
        scope=Scope.settings
    )
    use_latex_compiler = Boolean(
        help="Enable LaTeX templates?",
        default=False,
        scope=Scope.settings)


def compute_inherited_metadata(descriptor):
    """Given a descriptor, traverse all of its descendants and do metadata
    inheritance.  Should be called on a CourseDescriptor after importing a
    course.

    NOTE: This means that there is no such thing as lazy loading at the
    moment--this accesses all the children."""
    if descriptor.has_children:
        parent_metadata = descriptor.xblock_kvs.inherited_settings.copy()
        # add any of descriptor's explicitly set fields to the inheriting list
        for field in InheritanceMixin.fields.values():
            if field.is_set_on(descriptor):
                # inherited_settings values are json repr
                parent_metadata[field.name] = field.read_json(descriptor)

        for child in descriptor.get_children():
            inherit_metadata(child, parent_metadata)
            compute_inherited_metadata(child)


def inherit_metadata(descriptor, inherited_data):
    """
    Updates this module with metadata inherited from a containing module.
    Only metadata specified in self.inheritable_metadata will
    be inherited

    `inherited_data`: A dictionary mapping field names to the values that
        they should inherit
    """
    try:
        descriptor.xblock_kvs.inherited_settings = inherited_data
    except AttributeError:  # the kvs doesn't have inherited_settings probably b/c it's an error module
        pass


def own_metadata(module):
    """
    Return a dictionary that contains only non-inherited field keys,
    mapped to their serialized values
    """
    return module.get_explicitly_set_fields_by_scope(Scope.settings)


class InheritanceKeyValueStore(KeyValueStore):
    """
    Common superclass for kvs's which know about inheritance of settings. Offers simple
    dict-based storage of fields and lookup of inherited values.

    Note: inherited_settings is a dict of key to json values (internal xblock field repr)
    """
    def __init__(self, initial_values=None, inherited_settings=None):
        super(InheritanceKeyValueStore, self).__init__()
        self.inherited_settings = inherited_settings or {}
        self._fields = initial_values or {}

    def get(self, key):
        return self._fields[key.field_name]

    def set(self, key, value):
        # xml backed courses are read-only, but they do have some computed fields
        self._fields[key.field_name] = value

    def delete(self, key):
        del self._fields[key.field_name]

    def has(self, key):
        return key.field_name in self._fields

    def default(self, key):
        """
        Check to see if the default should be from inheritance rather than from the field's global default
        """
        return self.inherited_settings[key.field_name]
