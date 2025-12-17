import '/imports/collections';

// Used by Meteor tool self-tests to assert which config entrypoint file was loaded.
console.log(`RSPACK_FULL_APP_MARKER CONFIG_SERVER=${process.env.METEOR_CONFIG_SERVER || ''}`);
