export interface Character {
  id: string;
  name: string;
  description: string;
  image: string; // base64 data URL
  width?: number;
  height?: number;
  createdAt: number;
}
