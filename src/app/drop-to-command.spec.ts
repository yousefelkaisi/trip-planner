import { type Drop, dropToCommand } from './drop-to-command';

const drop = (
  from: number | 'browser',
  to: number,
  previousIndex: number,
  currentIndex: number,
): Drop => ({
  item: { data: 'p1' },
  container: { data: to },
  previousContainer: { data: from },
  previousIndex,
  currentIndex,
});

describe('dropToCommand', () => {
  it('adds a place dropped from the browser', () => {
    expect(dropToCommand(drop('browser', 1, 4, 2))).toEqual({
      type: 'addStop',
      day: 1,
      placeId: 'p1',
      index: 2,
    });
  });

  it('ignores a drop back where it started', () => {
    expect(dropToCommand(drop(0, 0, 3, 3))).toBeNull();
  });

  it('moves a stop within or between days', () => {
    expect(dropToCommand(drop(0, 0, 3, 1))).toEqual({
      type: 'moveStop',
      placeId: 'p1',
      day: 0,
      index: 1,
    });
    expect(dropToCommand(drop(0, 2, 3, 3))).toEqual({
      type: 'moveStop',
      placeId: 'p1',
      day: 2,
      index: 3,
    });
  });
});
