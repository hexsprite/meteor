import '/imports/collections';
import { strict as assert } from 'assert';

console.log(`RSPACK_FULL_APP_MARKER CONFIG_TEST_SERVER=${process.env.METEOR_CONFIG_TEST_SERVER || ''}`);

describe('rspack full-app regression', function () {
  it('runs server tests', function () {
    assert.equal(true, true);
  });
});
