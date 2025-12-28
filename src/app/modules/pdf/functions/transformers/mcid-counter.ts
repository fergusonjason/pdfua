export class MCIDCounter {

  constructor(private value = 0) {}

  next() {
    return this.value++;
  }

  current() {
    return this.value;
  }

  reset(to = 0) {
    this.value = to;
  }
}
