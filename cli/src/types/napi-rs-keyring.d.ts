declare module "@napi-rs/keyring" {
  export class Entry {
    constructor(service: string, account: string);
    setPassword(password: string): void;
    getPassword(): string | null;
    deletePassword(): void;
  }
}