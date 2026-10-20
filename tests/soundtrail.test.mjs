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

test('every SoundTrail instrument meets research standard v2', () => {
  for (const instrument of soundTrail.instruments) {
    assert.ok(Number(instrument.researchStandardVersion) >= 2, `Research standard v2 not completed: ${instrument.id}`);
    assert.ok(String(instrument.importance || '').trim(), `Missing importance: ${instrument.id}`);
    assert.ok((instrument.researchSources || []).length, `Missing research sources: ${instrument.id}`);
    assert.ok((instrument.genres || []).length >= 3, `Insufficient researched style map: ${instrument.id}`);
  }
});

test('every SoundTrail genre has research context and at least two track-level examples', () => {
  const spotifyTrackPattern = /^https:\/\/open\.spotify\.com\/(?:intl-[^/]+\/)?track\/[A-Za-z0-9]+(?:[/?#].*)?$/;

  for (const instrument of soundTrail.instruments) {
    for (const genre of instrument.genres || []) {
      assert.ok(String(genre.about || '').trim(), `Missing about text: ${instrument.id} / ${genre.name}`);
      assert.ok((genre.researchSources || []).length, `Missing research sources: ${instrument.id} / ${genre.name}`);

      const examples = soundTrail.recordings.filter((recording) =>
        (recording.instruments || []).includes(instrument.id)
        && recording.genresByInstrument?.[instrument.id] === genre.name
        && spotifyTrackPattern.test(recording.spotify || '')
      );
      const uniqueTrackUrls = new Set(examples.map((recording) => recording.spotify.replace(/\?.*$/, '')));

      assert.ok(
        uniqueTrackUrls.size >= 2,
        `Genre needs at least two verified track examples: ${instrument.id} / ${genre.name}`,
      );
    }
  }
});



test('Accordion keeps three verified track examples per researched style', () => {
  const spotifyTrackPattern = /^https:\/\/open\.spotify\.com\/(?:intl-[^/]+\/)?track\/[A-Za-z0-9]+(?:[/?#].*)?$/;
  const accordion = soundTrail.instruments.find((item) => item.id === 'accordion');
  assert.ok(accordion, 'Accordion instrument missing');

  for (const genre of accordion.genres || []) {
    const examples = soundTrail.recordings.filter((recording) =>
      (recording.instruments || []).includes('accordion')
      && recording.genresByInstrument?.accordion === genre.name
      && spotifyTrackPattern.test(recording.spotify || '')
    );
    const uniqueTrackUrls = new Set(examples.map((recording) => recording.spotify.replace(/\?.*$/, '')));
    assert.ok(
      uniqueTrackUrls.size >= 3,
      `Accordion style needs three verified track examples: ${genre.name}`,
    );
  }
});

test('SoundTrail recordings use stable IDs and preserve instrument relationships', () => {
  const ids = soundTrail.recordings.map((recording) => recording.id);
  assert.equal(new Set(ids).size, ids.length);
  const spotifyUrls = soundTrail.recordings.map((recording) => recording.spotify).filter(Boolean);
  assert.equal(new Set(spotifyUrls).size, spotifyUrls.length, 'SoundTrail should not duplicate the same Spotify resource');
  for (const recording of soundTrail.recordings) {
    assert.match(recording.id, /^soundtrail-recording-\d{4}$/);
    assert.ok(recording.instruments?.length);
    for (const instrumentId of recording.instruments) {
      assert.ok(recording.genresByInstrument?.[instrumentId]);
      assert.ok(recording.instrumentNotes?.[instrumentId]);
    }
  }
});

test('expanded SoundTrail instruments have researched breadth, not starter stubs', () => {
  for (const instrumentId of ['clarinet','pedal-steel-guitar','cello','sitar','double-bass','tabla']) {
    const instrument = soundTrail.instruments.find((item) => item.id === instrumentId);
    const recordings = soundTrail.recordings.filter((recording) => recording.instruments?.includes(instrumentId));
    assert.ok((instrument?.genres || []).length >= 6, `${instrumentId} needs a broad researched style map`);
    assert.ok(recordings.length >= 6, `${instrumentId} needs examples across that style map`);
  }
});
