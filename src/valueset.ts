import type Table from './table';
import type { DB, ORM } from '.';
import assign from 'lodash/assign';
import each from 'lodash/each';
import isFunction from 'lodash/isFunction';
// import { assign, each, isFunction } from 'lodash';
import { enumerable } from './decorators';

export default class ValueSet {
  constructor(table: Table, values: any, _options = {}) {
    assign(this, values || {});

    this.table = table
    this.db = table.db
    this.orm = table.orm
  }

  @enumerable(false)
  table: Table
  
  @enumerable(false)
  db: DB

  @enumerable(false)
  orm: ORM

  set(values) {
    assign(this, values);
    return this;
  }

  defaults() {
    each(this.table.fields, (field) => {
      if (field.defaultValue !== undefined && this[field.header || field.key] === undefined) {
        this[field.header || field.key] = isFunction(field.defaultValue) ? field.defaultValue.call(this) : field.defaultValue;
      }
    });
  }

  validate() {
    each(this.table.fields, (field) => {
      if (field.required && !this[field.header || field.key]) throw new Error(`field ${field.header || field.key} is required`);
    });
  }
}
