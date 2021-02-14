import assign from 'lodash/assign';
import each from 'lodash/each';
import isFunction from 'lodash/isFunction';
import { enumerable } from './decorators';
import type Table from './table';

import ValueSet from './valueset';

type RowOptions = {
  row?: number
}

export default class Row extends ValueSet {
  constructor(table: Table, values: any, options: RowOptions = {}) {
    super(table, values, options);
    this.row = options.row || null
  }

  @enumerable(false)
  row: number | null;

  async update(values) {
    this.set(values);
    this.validate();

    await this.orm.sheets.spreadsheets.values.update({
      spreadsheetId: this.db.id,
      range: this.table._prepareColumnRange(this.row),
      valueInputOption: 'RAW',
      requestBody: {
        majorDimension: 'COLUMNS',
        values: this.table._prepareValues(this)
      }
    });
    console.log('Row updated');
    return this;
  }
}
