import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  type ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { formatTime, hoursOn } from '@domain/hours';
import { type Place, WEEKDAYS } from '@domain/model/place';
import { FLAG_HINT, FLAG_LABELS } from '../labels';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Component({
  selector: 'app-place-detail',
  imports: [DatePipe],
  templateUrl: './place-detail.html',
})
export class PlaceDetail {
  readonly place = input.required<Place>();
  readonly date = input.required<string>();
  readonly closed = output();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly weekdays = WEEKDAYS;
  protected readonly flagLabels = FLAG_LABELS;
  protected readonly flagHint = FLAG_HINT;
  protected readonly formatTime = formatTime;

  protected readonly hours = computed(() => hoursOn(this.place(), this.date()));
  protected readonly hoursStated = computed(() =>
    WEEKDAYS.some((d) => this.place().hours[d] !== null),
  );
  protected readonly months = computed(() => {
    const months = this.place().openMonths;
    if (months === null) {
      return 'Not stated';
    }
    return months.length === 12 ? 'All year' : months.map((m) => MONTHS[m - 1]).join(', ');
  });

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }
}
