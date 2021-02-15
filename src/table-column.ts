import Table, { TableField, TableOptions } from './table';
import Column from './column';
import isPlainObject from 'lodash/isPlainObject';
// import { isPlainObject } from 'lodash';

import type { DB } from '.';

export default class ColumnTable extends Table {
  firstField: string;
  lastField: string;
  constructor(db: DB, name: string, fields: Record<string, TableField>, options: TableOptions = {}) {
    super(db, name, fields, options);

    this.valueSetClass = Column;
  }

  ddl() {
    if (!this.ddlSynced) {
      this.ddlSynced = this.create().then(() => {
        let rowIndex = 0;

        const processField = (key, field, fields, prefix = '') => {
          const type = fields[key].type;

          if (isPlainObject(type)) {
            Object.keys(type).map((subKey) => {
              processField(subKey, type[subKey], type);
            });

            return;
          }

          fields[key].row = this.skipRows + rowIndex;
          rowIndex++;
        };

        Object.keys(this.fields).map((key, index) => {
          this.fields[key].first = index === 0;
          this.fields[key].last = index === (Object.keys(this.fields).length - 1);

          if (this.fields[key].first) {
            this.firstField = key;
          }
          if (this.fields[key].last) {
            this.lastField = key;
          }

          processField(key, this.fields[key], this.fields);
        });
      });
    }
    return this.ddlSynced;
  }
};
