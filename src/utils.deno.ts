export type RequestEvent = {
  request: Request;
  respondWith(r: Response): Promise<void>;
};
