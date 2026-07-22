import { describe, expect, it } from 'vitest';
import { parseTcx, TcxParseError } from './tcx';

// Fixture plan (dev plan Sprint 1) — add real device exports to ./fixtures/:
//   garmin.tcx, coros.tcx, missing-hr.tcx, missing-cadence.tcx, corrupt.tcx
describe('parseTcx', () => {
  it('throws until implemented (Sprint 1)', () => {
    expect(() => parseTcx('<xml/>')).toThrow(TcxParseError);
  });

  it.todo('parses a Garmin TCX with HR, cadence, and power');
  it.todo('parses a Coros TCX');
  it.todo('omits heart rate when the file has none (never defaults to 0)');
  it.todo('omits cadence when the file has none');
  it.todo('normalizes single-leg cadence (< 120) to SPM by doubling');
  it.todo('aggregates laps and discards trackpoints');
  it.todo('rejects corrupt XML with TcxParseError');
});
