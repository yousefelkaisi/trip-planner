import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import { Component, input, output } from '@angular/core';
import { formatTime } from '@domain/hours';
import type { Issue } from '@domain/model/trip';
import type { ScheduledStop } from '@domain/schedule';
import { FLAG_HINT, FLAG_LABELS, MODE_LABELS, SEVERITY_CLASSES } from '../labels';

@Component({
  selector: 'app-stop-card',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './stop-card.html',
})
export class StopCard {
  readonly stop = input.required<ScheduledStop>();
  readonly issues = input.required<Issue[]>();
  readonly first = input(false);
  readonly last = input(false);
  readonly moveTargets = input<number[]>([]);

  readonly moveBy = output<number>();
  readonly moveTo = output<number>();
  readonly remove = output();
  readonly details = output();

  // Right-aligned under the ⋯ button, or above it when there's no room below.
  protected readonly menuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
  ];

  protected readonly formatTime = formatTime;
  protected readonly flagLabels = FLAG_LABELS;
  protected readonly flagHint = FLAG_HINT;
  protected readonly modeLabels = MODE_LABELS;
  protected readonly severityClasses = SEVERITY_CLASSES;
}
