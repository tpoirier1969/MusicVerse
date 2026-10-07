import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const soundTrail = JSON.parse(await readFile(new URL('../public/data/soundtrail.json', import.meta.url), 'utf8'));

test('SoundTrail exposes the approved instrument set once each', () => {
  const ids = soundTrail.instruments.map((item) => item.id);
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

test('every SoundTrail genre has an about description and at least one matching recording', () => {
  for (const instrument of soundTrail.instruments) {
    for (const genre of instrument.genres || []) {
      assert.ok(String(genre.about || '').trim(), `Missing about text: ${instrument.id} / ${genre.name}`);
      assert.ok(
        soundTrail.recordings.some((recording) =>
          (recording.instruments || []).includes(instrument.id)
          && recording.genresByInstrument?.[instrument.id] === genre.name
        ),
        `Genre has no recordings: ${instrument.id} / ${genre.name}`,
      );
    }
  }
});

test('SoundTrail recordings use stable IDs and preserve instrument relationships', () => {
  const ids = soundTrail.recordings.map((recording) => recording.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const recording of soundTrail.recordings) {
    assert.match(recording.id, /^soundtrail-recording-\d{4}$/);
    assert.ok(recording.instruments?.length);
    for (const instrumentId of recording.instruments) {
      assert.ok(recording.genresByInstrument?.[instrumentId]);
      assert.ok(recording.instrumentNotes?.[instrumentId]);
    }
  }
});

test('new SoundTrail instruments have starter recordings', () => {
  for (const instrumentId of ['clarinet','pedal-steel-guitar','cello','sitar','double-bass','tabla']) {
    const count = soundTrail.recordings.filter((recording) => recording.instruments?.includes(instrumentId)).length;
    assert.ok(count >= 3, `${instrumentId} needs at least three starter recordings`);
  }
});
