import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDTRAIL_INSTRUMENTS } from '../src/data.js';

test('SoundTrail exposes the approved instrument set once each', () => {
  const ids = SOUNDTRAIL_INSTRUMENTS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    'accordion',
    'clarinet',
    'pedal-steel-guitar',
    'cello',
    'sitar',
    'double-bass',
    'tabla',
  ]);
});
