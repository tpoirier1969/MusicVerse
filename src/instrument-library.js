export const resourceTabs = [
  ['overview', 'Overview'],
  ['listen', 'Listen'],
  ['learn', 'Learn'],
  ['sheet', 'Sheet Music'],
  ['websites', 'Websites'],
];

export function sectionForReference(item) {
  if (item.type === 'sheet_music') return 'sheet';
  if (['tab', 'chords', 'tuning', 'lesson'].includes(item.type)) return 'learn';
  if (/spotify\.com|youtube\.com|youtu\.be|bandcamp\.com|music\.apple\.com/i.test(item.url || '')) return 'listen';
  return 'websites';
}

export function resourceReferenceType(section) {
  return section === 'sheet' ? 'sheet_music' : section === 'learn' ? 'lesson' : 'other';
}

function safeUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function findText(item) {
  return [item.title, item.artist, item.notes, item.provider, item.collection, ...(item.tags || [])]
    .filter(Boolean).join(' ').toLowerCase();
}

function curatedCard(item, savedUrls, esc) {
  const url = safeUrl(item.url);
  if (!url) return '';
  const saved = savedUrls.has(url);
  return '<article class="instrument-resource-card organic-panel">' +
    '<div class="instrument-resource-copy"><small>' + esc(item.collection || 'Resources') + ' · ' + esc(item.provider || 'Website') + '</small>' +
    '<h3>' + esc(item.title) + '</h3>' +
    (item.artist ? '<p class="instrument-resource-artist">' + esc(item.artist) + '</p>' : '') +
    (item.notes ? '<p>' + esc(item.notes) + '</p>' : '') +
    '<div class="instrument-resource-tags">' + (item.tags || []).slice(0,4).map(tag => '<span>' + esc(tag) + '</span>').join('') + '</div></div>' +
    '<div class="instrument-resource-actions"><a class="secondary-action" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open ↗</a>' +
    '<button type="button" class="secondary-action" data-save-curated-resource="' + esc(item.id) + '"' +
    (saved ? ' disabled' : '') + '>' + (saved ? '✓ Saved' : '+ My links') + '</button></div></article>';
}

function personalCard(item, esc) {
  const url = safeUrl(item.url);
  return '<article class="instrument-resource-card organic-panel"><div class="instrument-resource-copy">' +
    '<small>MY LINK · ' + esc(item.provider || 'Personal reference') + '</small><h3>' + esc(item.title) + '</h3>' +
    (item.notes ? '<p>' + esc(item.notes) + '</p>' : '') + '</div>' +
    '<div class="instrument-resource-actions">' +
    (url ? '<a class="secondary-action" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open ↗</a>' : '') +
    '<button type="button" class="secondary-action" data-remove-reference="' + esc(item.id) + '">Remove</button></div></article>';
}

export function renderResourceLibrary({ instrument, section, resources, references, query, collection, esc, syncSummary }) {
  const all = (resources || []).filter(item => item.instrument === instrument.id && item.section === section);
  const owned = (references || []).filter(item => item.instrument === instrument.id && sectionForReference(item) === section);
  const collections = [...new Set(all.map(item => item.collection).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const search = String(query || '').toLowerCase().trim();
  const shown = all.filter(item => (!collection || item.collection === collection) && (!search || findText(item).includes(search)));
  const mine = owned.filter(item => !search || findText(item).includes(search));
  const savedUrls = new Set(owned.map(item=>safeUrl(item.url)).filter(Boolean));
  const heading = resourceTabs.find(item=>item[0]===section)?.[1] || 'Resources';
  return '<section class="instrument-resource-section">' +
    '<div class="section-heading"><div><span class="eyebrow">YOUR ' + esc(instrument.label.toUpperCase()) + ' LIBRARY</span>' +
    '<h2>' + esc(heading) + '</h2><p>Researched links and personal bookmarks. ' + esc(syncSummary) + '</p></div></div>' +
    '<form data-instrument-resource-search class="instrument-resource-filters organic-panel">' +
    '<label><span>Search</span><input type="search" name="q" value="' + esc(query) + '" placeholder="Song, artist, style, keyword…"></label>' +
    '<label><span>Collection</span><select name="collection"><option value="">All collections</option>' +
    collections.map(name=>'<option value="' + esc(name) + '"' + (name===collection?' selected':'') + '>' + esc(name) + '</option>').join('') +
    '</select></label><button class="primary-action" type="submit">Search</button>' +
    '<button class="secondary-action" type="button" data-resource-clear>Clear</button></form>' +
    (shown.length ? '<div class="instrument-resource-list">' + shown.map(item=>curatedCard(item,savedUrls,esc)).join('') + '</div>' :
      '<p class="empty-state">No curated links match these filters.</p>') +
    (mine.length ? '<h3 class="instrument-resource-my-heading">My saved links (' + mine.length + ')</h3>' +
      '<div class="instrument-resource-list">' + mine.map(item=>personalCard(item,esc)).join('') + '</div>' : '') +
    '<details class="instrument-resource-add organic-panel"><summary>+ Save another ' + esc(instrument.label) + ' link</summary>' +
    '<form data-instrument-new-reference>' +
    '<label>Title<input type="text" name="title" required placeholder="Song, artist or resource title"></label>' +
    '<label>URL<input type="url" name="url" required placeholder="https://…"></label>' +
    '<label>Source / artist<input type="text" name="provider" placeholder="Spotify, YouTube, performer…"></label>' +
    '<label>Notes<textarea name="notes" rows="3" placeholder="Why you want to keep this"></textarea></label>' +
    '<label>Difficulty (optional)<input type="text" name="difficulty" placeholder="Beginner / intermediate / advanced"></label>' +
    '<input type="hidden" name="section" value="' + esc(section) + '">' +
    '<input type="hidden" name="instrument" value="' + esc(instrument.id) + '">' +
    '<button class="primary-action" type="submit">Save link</button></form></details></section>';
}
