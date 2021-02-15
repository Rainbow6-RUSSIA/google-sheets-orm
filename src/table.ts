import find from 'lodash/find';
import findKey from 'lodash/findKey';
import mapValues from 'lodash/mapValues';
import last from 'lodash/last';
import isPlainObject from 'lodash/isPlainObject';
// import { find, findKey, mapValues, last, isPlainObject }  from 'lodash';

import Sheet from './sheet';
import {processResponse, numberToColumnLetter, RowExistsError, ColumnExistsError, ROW, COLUMN, APPEND, PREPEND} from './util';
import type {DB, ORM} from '.';
import { InsertOrder, TableMode } from './types';
import RowTable from './table-row';
import ColumnTable from './table-column';

export type TableOptions = {
  mode?: TableMode,
  insertOrder?: InsertOrder,
  skipRows?: number,
  skipColumns?: number;
}

export type TableField = {
  required?: boolean;
  primaryKey?: boolean;
  header?: string;
  key?: string;
  defaultValue?: string | (() => string);
  first?: any;
  last?: any;
  type?: any;
  column?: number;
  row?: number;
  location?: number;
};

export default abstract class Table extends Sheet {
  orm: ORM;
  mode: TableMode;
  insertOrder: InsertOrder;
  name: string;
  db: DB;
  pk: string;
  skipRows: number;
  skipColumns: number;
  skip: number;
  valueSetClass: any;
  ddlSynced: Promise<any> | null;
  fields: { [x: string]: TableField; };
  constructor(db: DB, name: string, fields: Record<string, TableField>, options: TableOptions = {}) {
    super(db, name, options);
    if (!db || !name || !fields) throw new Error('new Table(db, name, fields) is required');

    this.orm = db.orm;
    this.mode = options.mode || TableMode.ROW;
    this.insertOrder = options.insertOrder || InsertOrder.APPEND;

    if (this.mode === COLUMN && this.insertOrder === APPEND) throw new Error('APPEND is not supported for mode COLUMN currently');

    this.name = name;
    this.db = db;
    this.fields = mapValues(fields, (field, key) => ({
      ...field,
      header: field.header || key,
      key: field.header || key
    }));
    this.pk = findKey(fields, (field) => field.primaryKey === true);
    this.fields[this.pk].required = true;
    this.skipRows = options.skipRows || 0;
    this.skipColumns = options.skipColumns || 0;
    this.skip = options.mode === COLUMN ? this.skipColumns : this.skipRows;

    if (!this.pk) throw new Error('Table must have primaryKey defined');

    this.ddlSynced = null;
  }

  isRowTable(): this is RowTable {
    return this instanceof RowTable
  }
  isColumnTable(): this is ColumnTable {
    return this instanceof ColumnTable
  }

  abstract ddl(): Promise<any>

  insert(values) {
    if (Array.isArray(values)) {
      // TODO: Optimize
      return Promise.all(values.map(item => this.insert(item)));
    }

    const valueSet = new this.valueSetClass(this, values);
    valueSet.defaults();
    valueSet.validate();

    return this.ddl().then(() => {
      return this.findByPk(valueSet[this.pk]).then(existingValueSet => {
        if (existingValueSet) throw new (this.mode === ROW ? RowExistsError : ColumnExistsError)(`${this.mode} with primary key ${valueSet[this.pk]} already exists`);

        return Promise.resolve().then(() => {
          if (this.insertOrder === PREPEND) {
            return this.orm.sheets.spreadsheets.batchUpdate({
              spreadsheetId: this.db.id,
              requestBody: {
                requests: [
                  {
                    insertDimension: {
                      range: {
                        sheetId: this.id(),
                        dimension: this.mode === ROW ? 'ROWS' : 'COLUMNS',
                        startIndex: this.skip + (this.mode === ROW ? 1 : 0),
                        endIndex: this.skip + (this.mode === ROW ? 2 : 1)
                      },
                      inheritFromBefore: false
                    }
                  }
                ]
              }
            }).then(() => {
              return this.orm.sheets.spreadsheets.values.update({
                spreadsheetId: this.db.id,
                range: this.mode === ROW ? this._prepareColumnRange(2) : this._prepareRowRange(0),
                valueInputOption: 'RAW',
                requestBody: {
                  majorDimension: this.mode === ROW ? 'COLUMNS' : 'COLUMNS',
                  values: this._prepareValues(valueSet)
                }
              }).then(processResponse).then((response) => {
                if (this.mode === ROW) {
                  valueSet.row = parseInt(response.updatedRange.match(/(\d+)$/)[1], 10);
                }
                if (this.mode === COLUMN) {
                  valueSet.column = response.updatedRange.match(/(\w+)\d+$/)[1];
                }
              });
            });
          } else {
            return this.orm.sheets.spreadsheets.values.append({
              spreadsheetId: this.db.id,
              range: this.mode === ROW ? this._prepareColumnRange(2) : this._prepareRowRange(0),
              valueInputOption: 'RAW',
              insertDataOption: 'INSERT_ROWS',
              requestBody: {
                majorDimension: this.mode === ROW ? 'COLUMNS' : 'ROWS',
                values: this._prepareValues(valueSet)
              }
            }).then(processResponse).then(response => {
              if (this.mode === ROW) {
                valueSet.row = parseInt(response.updates.updatedRange.match(/(\d+)$/)[1], 10);
              }
              if (this.mode === COLUMN) {
                valueSet.column = response.updates.updatedRange.match(/(\w+)\d+$/)[1];
              }
            });
          }
        });
      }).then(() => {
        return valueSet;
      });
    });
  }

  upsert(values) {
    const pk = values[this.pk];
    if (!pk) throw new Error('upsert: pk must be in values');

    return this.findByPk(pk).then((valueSet) => {
      if (valueSet) return valueSet.update(values);
      return this.insert(values);
    });
  }

  findByPk(search) {
    return this.findAll().then((valueSets) => {
      if (!valueSets.length) return null;
      return valueSets.find(valueSet => valueSet[this.pk] === search) || null;
    });
  }

  findAll() {
    return this.ddl().then(() => {
      return this.orm.sheets.spreadsheets.values.get({
        spreadsheetId: this.db.id,
        range: this.name,
        majorDimension: this.isRowTable() ? 'ROWS' : 'COLUMNS',
      }).then(processResponse).then(response => {
        if (!response.values) return [];
        const skip = this.skip + (this.mode === ROW ? 1 : 0);
        const responseValues = response.values.slice(skip, response.values.length);
        if(!responseValues.length) return [];

        if (this.mode === ROW) {
          return responseValues.map((row, index) => {
            const values = row.reduce((memo, value, index) => {
              const column = numberToColumnLetter(index);
              const field = find(this.fields, search => search.column === column);
              if (!field) return memo;

              memo[field.header] = value === null ? null : field.type ? field.type(value) : value;
              return memo;
            }, {});

            return new this.valueSetClass(this, values, {
              row: skip + index + 1
            });
          });
        }
        if (this.mode === COLUMN) {
          return responseValues.map((column) => {
            const values = column.reduce((memo, value, index) => {
              const field = find(this.fields, search => search.row === index);
              if (!field) return memo;
              memo[field.key] = field.type ? field.type(value) : value;
              return memo;
            }, {});
            return new this.valueSetClass(this, values, {});
          });
        }
      });
    });
  }

  _prepareValues(values) {
    if (this.isRowTable()) {
      return this.columns().map(column => {
        return [column.field ? values[column.field.header] : undefined];
      });
    }
    if (this.isColumnTable()) {
      return [this._prepareColumnValues(values, this.fields)];
    }
  }

  _prepareColumnValues(values, fields) {
    return Object.keys(fields).reduce((memo, key) => {
      if (isPlainObject(fields[key].type)) return memo.concat(this._prepareColumnValues(values[key], fields[key].type));
      if (Array.isArray(fields[key].type)) return memo.concat([values[key].join(',')]);
      return memo.concat([values[key]]);
    }, []);
  }

  _prepareRowRange(index) {
    const letter = numberToColumnLetter(this.skipColumns + index);
    return `${this.name}!${letter}${this.skipRows + 1}:${letter}1000`;
  }

  _prepareColumnRange(firstRow: number, lastRow?: number) {
    if (!this.isRowTable()) throw new Error(`_prepareColumnRange isn't implemented in ${this.mode} table`);
    const columns = this.columns();
    lastRow = lastRow || firstRow;

    return `${this.name}!${columns[0].letter}${firstRow}:${last(columns).letter}${lastRow}`;
  }
}
