import { TestBed } from '@angular/core/testing';
import type { Place } from '@domain/model/place';
import { everyDay, makePlace } from '@domain/testing';
import { PlaceDetail } from './place-detail';

describe('PlaceDetail', () => {
  async function render(fields: Partial<Place>) {
    const fixture = TestBed.createComponent(PlaceDetail);
    fixture.componentRef.setInput('place', makePlace(fields));
    fixture.componentRef.setInput('date', '2026-10-16');
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent!;
  }

  it('shows the seasonal notes as written', async () => {
    const seasonalNotes = 'Closed Sundays except the last Sunday of the month.';
    const text = await render({ source: { hours: null, seasonalNotes } });
    expect(text).toContain(seasonalNotes);
  });

  it("shows the date's hours and the weekly hours", async () => {
    const text = await render({
      hours: { ...everyDay([{ open: '09:00', close: '18:00' }]), mon: [], tue: null },
    });
    expect(text).toMatch(/Friday 16 October\s*Open\s*09:00–18:00/);
    expect(text).toMatch(/mon\s*Closed\s*tue\s*Unavailable\s*wed\s*09:00–18:00/);
    expect(text).toMatch(/Months\s*All year/);
  });

  it('explains why the place is closed on the date', async () => {
    const text = await render({ openMonths: [4, 5] });
    expect(text).toMatch(/Friday 16 October\s*Closed in October/);
    expect(text).toMatch(/Months\s*Apr, May/);
  });

  it('says when the hours and months are not stated', async () => {
    const text = await render({ hours: everyDay(null), openMonths: null });
    expect(text).toContain('Hours unavailable; check before going');
    expect(text).toMatch(/Weekly hours\s*Unavailable\s*Months\s*Not stated/);
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
