export interface DecodedCursor {
  date: Date;
  id: string;
}

export function encodeCursor(date: Date, id: string): string {
  return Buffer.from(`${date.toISOString()}|${id}`).toString('base64');
}

export function decodeCursor(cursor: string): DecodedCursor {
  const raw = Buffer.from(cursor, 'base64').toString('utf8');
  const separatorIndex = raw.indexOf('|');
  return {
    date: new Date(raw.substring(0, separatorIndex)),
    id: raw.substring(separatorIndex + 1),
  };
}
