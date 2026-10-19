// Synthetic inventory. Never copy runtime data into tests.
export const fixture = {
  boxes: [
    { boxId: 'IVAR-G-H6-P1-A', label: 'Soldering tools', currentLocationId: 'G-H6-P1-A', notes: 'Red box', createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-02T10:00:00Z' },
    { boxId: 'BENCH-2-UNDER-P1-A', label: 'Träskruvar', currentLocationId: 'BENCH:2:UNDER:P1:A', createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-02T10:00:00Z' }
  ],
  sessions: [
    { sessionId: 'S-0', boxId: 'IVAR-G-H6-P1-A', summary: 'Old contents', createdAt: '2026-01-01T10:00:00Z', itemKeywords: ['old'], isCurrent: false },
    { sessionId: 'S-1', boxId: 'IVAR-G-H6-P1-A', summary: 'Lödtenn, lödfett och lödsug.', createdAt: '2026-01-02T10:00:00Z', itemKeywords: ['lödtenn', 'solder'], isCurrent: true },
    { sessionId: 'S-2', boxId: 'BENCH-2-UNDER-P1-A', summary: 'Träskruvar i olika längder.', createdAt: '2026-01-02T10:00:00Z', itemKeywords: ['skruv', 'träskruv'], isCurrent: true }
  ],
  photos: [
    { photoId: 'S-0:1', sessionId: 'S-0', immichAssetId: 'old-photo', photoRole: 'inside' },
    { photoId: 'S-1:1', sessionId: 'S-1', immichAssetId: 'asset-label', photoRole: 'label' },
    { photoId: 'S-1:2', sessionId: 'S-1', immichAssetId: 'asset-inside', photoRole: 'inside' }
  ]
};
