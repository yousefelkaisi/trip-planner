import { TestBed } from '@angular/core/testing';
import type { Place } from '@domain/model/place';
import { makePlace } from '@domain/testing';
import { PlaceDetail } from './place-detail';

describe('PlaceDetail', () => {
  async function render(fields: Partial<Place>) {
    const fixture = TestBed.createComponent(PlaceDetail);
    fixture.componentRef.setInput('place', makePlace(fields));
    fixture.componentRef.setInput('date', '2026-10-16');
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent!;
  }

  it('shows the seasonal notes next to the interpreted hours', async () => {
    const seasonalNotes = 'Closed Sundays except the last Sunday of the month.';
    const text = await render({ source: { hours: null, seasonalNotes } });
    expect(text).toContain(seasonalNotes);
  });

  it('shows the best time', async () => {
    expect(await render({ bestTime: 'evening' })).toMatch(/Best time\s*evening/);
  });

  it('leaves out source text and a best time the listing does not have', async () => {
    const text = await render({});
    expect(text).not.toContain('Notes');
    expect(text).not.toContain('Best time');
  });
});
