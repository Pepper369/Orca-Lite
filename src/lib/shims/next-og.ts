// Next.js OG ImageResponse compatibility shim

export class ImageResponse extends Response {
  constructor(element: any, options?: any) {
    super(null, {
      headers: {
        "content-type": "image/png",
      },
    });
  }
}
