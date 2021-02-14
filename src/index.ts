import keyBy from 'lodash/keyBy';
import noop from 'lodash/noop';

import {processResponse, RowExistsError, ColumnExistsError, ROW, COLUMN, PREPEND, APPEND, numberToColumnLetter} from './util';


import Sheet from './sheet';
import RowTable from './table-row';
import ColumnTable from './table-column';
import type { TableOptions } from './table';
import { InsertOrder, TableMode } from './types';
import type { drive_v3, sheets_v4 } from "googleapis"

class ORM {
  static DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4", "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
  static SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly";
  static ROW = TableMode.ROW;
  static COLUMN = TableMode.COLUMN;
  static PREPEND = InsertOrder.PREPEND;
  static APPEND = InsertOrder.APPEND;
  client: any;
  drive: drive_v3.Drive;
  sheets: sheets_v4.Sheets;
  static RowExistsError = RowExistsError;
  static ColumnExistsError = ColumnExistsError;
  static utils = { numberToColumnLetter }

  constructor(gapiClient) {
    this.client = gapiClient
    this.drive = this.client.drive;
    this.sheets = this.client.sheets;
  }

  db(name) {
    return new DB(this, name);
  }

  async search(query) {
    const d = await this.drive.files.list({
      q: `'me' in owners and mimeType='application/vnd.google-apps.spreadsheet' and name contains '${query}' and trashed = false`,
      'fields': "files(id,name)"
    });
    const response = processResponse(d);
    return response.files.map(file => this.db(file));
  }
}

class DB {
  orm: ORM;
  name: string;
  id: string;
  sheets: Record<string, sheets_v4.Schema$Sheet>;
  found: Promise<any> | null;
  created: Promise<any> | null;
  constructor(orm, value) {
    let name, id;
    if (typeof value === 'string') {
      name = value;
    } else {
      name = value.name;
      id = value.id;
    }

    this.orm = orm;
    this.name = name || null;
    this.created = null;
    this.found = null;
    this.id = id || null;
    this.sheets = {};
  }

  find() {
    if (!this.found) {
      this.found = Promise.resolve().then(() => {
        if (this.id) return;
        return this.orm.drive.files.list({
          q: `mimeType='application/vnd.google-apps.spreadsheet' and name = '${this.name}' and trashed = false`,
          'pageSize': 1,
          'fields': "files(id)"
        }).then(processResponse).then((response) => {
           const file = response.files[0];
           if (file) this.id = file.id;
        });
      }).then(() => {
        if (!this.id) return null;

        return this.orm.sheets.spreadsheets.get({
          spreadsheetId: this.id
        }).then(processResponse).then(response => {
          this.name = response.properties.title;
          this.sheets = keyBy(response.sheets, 'properties.title');
          return this;
        });
      });
    }
    return this.found;
  }

  create() {
    if (!this.created) {
      this.created = this.find().then(response => {
        if (response) return response;
        return this.orm.sheets.spreadsheets.create({
          requestBody: {
            properties: {
              title: this.name
            }
          }
        }).then((response) => {
          this.id = response.data.spreadsheetId;
          console.log(`Database created: ${this.id}`);
          return response.data;
        });
      }).then(({sheets}) => {
        this.sheets = keyBy(sheets, 'properties.title');
        return this;
      });
    }
    return this.created;
  }

  destroy() {
    return this.find().then((response) => {
      if (!response) return;
      return this.orm.drive.files.delete({
        fileId: this.id
      }).then(noop, function (result) {
        result = processResponse(result);

        if (result.error) {
          if (result.error.code === 404) return null;
          throw result.error;
        }
        throw result;
      });
    }).then(() => {
      this.found = null;
      this.created = null;
    });
  }

  sheet(name, options) {
    return new Sheet(this, name, options);
  }

  table(name, fields, options: TableOptions = {}) {
    options.mode = options.mode || TableMode.ROW;
    options.insertOrder = options.insertOrder || InsertOrder.APPEND;
    if (![ROW, COLUMN].includes(options.mode)) throw new Error('Table mode must be one of [GoogleSheetsORM.ROW, GoogleSheetsORM.COLUMN]');
    if (![PREPEND, APPEND].includes(options.insertOrder)) throw new Error('Table insert order must be one of [GoogleSheetsORM.PREPEND, GoogleSheetsORM.APPEND]');

    if (options.mode === ROW) return new RowTable(this, name, fields, options);
    if (options.mode === COLUMN) return new ColumnTable(this, name, fields, options);
  }
}

export default ORM;
export { ORM, DB }
