import { TestBed } from '@angular/core/testing';
import { makePlace } from '@domain/testing';
import { PlaceDetail } from './place-detail';

describe('PlaceDetail', () => {
  async function render(source: { hours: string | null; seasonalNotes: string | null }) {
    const fixture = TestBed.createComponent(PlaceDetail);
    fixture.componentRef.setInput('place', makePlace({ source }));
    fixture.componentRef.setInput('date', '2026-10-16');
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent!;
  }

  it('shows the original hours and notes next to the interpreted hours', async () => {
    const text = await render({
      hours: 'Mon-Sat 9:00-18:00',
      seasonalNotes: 'Closed Sundays except the last Sunday of the month.',
    });
    expect(text).toContain('As listed');
    expect(text).toContain('Mon-Sat 9:00-18:00');
    expect(text).toContain('Closed Sundays except the last Sunday of the month.');
  });

  it('leaves out source text the listing does not have', async () => {
    const text = await render({ hours: null, seasonalNotes: null });
    expect(text).not.toContain('As listed');
    expect(text).not.toContain('Notes');
  });
});
