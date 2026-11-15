declare module "piexifjs" {
  const piexif: {
    remove(dataUrl: string): string;
    load(dataUrl: string): Record<string, unknown>;
    dump(exifObj: Record<string, unknown>): string;
    insert(exifStr: string, dataUrl: string): string;
  };
  export default piexif;
}
