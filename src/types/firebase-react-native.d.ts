declare module 'firebase/auth/react-native' {
  import type { Persistence } from 'firebase/auth';
  export function getReactNativePersistence(storage: any): Persistence;
}
