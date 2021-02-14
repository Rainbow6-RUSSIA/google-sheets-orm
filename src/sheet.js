import type { ORM, DB } from '.';
import Cell, { CellOptions } from './cell';
import {processResponse} from './util';

export default class Sheet {
  name: string;
  db: DB;
  orm: ORM;
  _create: Promise<any> | null;
  constructor(db: DB, name: string, options = {}) {
    if (!db || !name) throw new Error('new Sheet(db, name) is required');

    this.orm = db.orm;
    this.name = name;
    this.db = db;

    this._create = null;
  }

  id() {
    return this.db.sheets[this.name] ? this.db.sheets[this.name].properties.sheetId : null;
  }

  create(): Promise<any> {
    if (!this._create) {
      this._create = this.db.create().then(() => {
        if (!this.db.sheets[this.name]) {
          return this.orm.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.db.id,
            requestBody: {
              requests: [
                {
                  addSheet: {
                    properties: {
                      title: this.name
                    }
                  }
                }
              ]
            }
          }).then(processResponse).then(response => {
            this.db.sheets[this.name] = response.replies[0].addSheet;
          });
        } else {
          return Promise.resolve();
        }
      });
    }
    return this._create;
  }

  getRaw(majorDimension = 'ROWS') {
    return this.orm.sheets.spreadsheets.values.get({
      spreadsheetId: this.db.id,
      range: `${this.name}!A:XXX`,
      majorDimension
    }).then(processResponse).then(response => {
      return response.values;
    });
  }

  cell(value: string | null, options: CellOptions = {}) {
    return new Cell(this, value, options);
  }
}
