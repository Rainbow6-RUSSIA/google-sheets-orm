import assign from 'lodash/assign';
import each from 'lodash/each';
import isFunction from 'lodash/isFunction';
import { enumerable } from './decorators';
import type Table from './table';

import ValueSet from './valueset';

type ColumnOptions = {
  column?: number
}

export default class Column extends ValueSet {
  constructor(table: Table, values: any, options: ColumnOptions = {}) {
    super(table, values, options);
    this.column = options.column || null
  }

  @enumerable(false)
  column: number | null

  validate() {

  }
}
