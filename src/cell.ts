import type { ORM, DB } from '.';
import { enumerable } from './decorators';
import type Sheet from './sheet';
import {numberToColumnLetter} from './util';

export type CellOptions = {
  id?: string;
  row?: number;
  column?: number;
};

export default class Cell {
  value: string | null;
  id: string;
  constructor(sheet: Sheet, value: string | null, options: CellOptions = {}) {
    this.sheet = sheet
    this.db = sheet.db
    this.orm = sheet.orm
    this.value = value;
    if (options.id) this.id = options.id;
    if (options.row && options.column) this.id = numberToColumnLetter(options.column) + (options.row + 1);
    if (!this.id) throw new Error('Cell id must be supplied');
  }

  @enumerable(false)
  sheet: Sheet
  @enumerable(false)
  db: DB
  @enumerable(false)
  orm: ORM

  async update(value: string | null) {
    this.value = value;

    await this.sheet.create();
    await this.orm.sheets.spreadsheets.values.update({
      spreadsheetId: this.db.id,
      range: `${this.sheet.name}!${this.id}`,
      valueInputOption: 'RAW',
      requestBody: {
        majorDimension: 'ROWS',
        values: [[this.value]]
      }
    });
    console.log('Cell updated');
    return this;
  }
}
