import {
  PDFDocument,
  PDFContext,
  PDFDict,
  PDFArray,
  PDFStream,
  PDFName,
  PDFNumber,
  PDFString,
  PDFHexString,
  PDFBool,
  PDFNull,
  PDFRef,
  PDFObject,
} from 'pdf-lib';

export const getPageContentRefs = (pdfDoc: PDFDocument): Set<PDFRef> => {

  const pageContentRefs: Set<PDFRef> = new Set();

  pdfDoc.getPages().forEach(page => {
    const dict = page.node;
    const contents = dict.get(PDFName.of('Contents'));

    if (!contents) {
      return;
    }

    const result = contents instanceof PDFArray
      ? contents.asArray().filter((item): item is PDFRef => item instanceof PDFRef)
      : contents instanceof PDFRef ? [contents] : [];

    result.forEach(ref => pageContentRefs.add(ref));
  });

  return pageContentRefs;
}

// ------------------------------------------------------------
// Convert PDFDict → plain JS object (LiteralObject)
// ------------------------------------------------------------
export const dictToLiteral = (dict: PDFDict): Record<string, any> => {
  const literal: Record<string, any> = {};
  for (const key of dict.keys()) {
    literal[key.asString()] = dict.get(key);
  }
  return literal;
};

// ------------------------------------------------------------
// Clone dispatcher
// ------------------------------------------------------------
export const cloneObject = (obj: any, ctx: PDFContext): any => {
  if (obj instanceof PDFDict) return cloneDict(obj, ctx);
  if (obj instanceof PDFArray) return cloneArray(obj, ctx);
  if (obj instanceof PDFStream) return cloneStream(obj, ctx);
  if (obj instanceof PDFRef) return obj;

  if (obj instanceof PDFName) return obj;
  if (obj instanceof PDFNumber) return obj;
  if (obj instanceof PDFString) return obj;
  if (obj instanceof PDFHexString) return obj;
  if (obj instanceof PDFBool) return obj;
  if (obj === PDFNull) return obj;

  throw new Error("Unknown PDF object type: " + obj?.constructor?.name);
};

// ------------------------------------------------------------
// Clone dictionary
// ------------------------------------------------------------
export const cloneDict = (dict: PDFDict, ctx: PDFContext): PDFDict => {
  const newDict = ctx.obj({});
  for (const key of dict.keys()) {
    newDict.set(key, cloneObject(dict.get(key), ctx));
  }
  return newDict;
};

// ------------------------------------------------------------
// Clone array
// ------------------------------------------------------------
export const cloneArray = (arr: PDFArray, ctx: PDFContext): PDFArray => {
  const newArr = ctx.obj([]);
  for (const item of arr.asArray()) {
    newArr.push(cloneObject(item, ctx));
  }
  return newArr;
};

// ------------------------------------------------------------
// Clone stream
// ------------------------------------------------------------
export const cloneStream = (stream: PDFStream, ctx: PDFContext): PDFStream => {
  const clonedDict = cloneDict(stream.dict, ctx);
  const literal = dictToLiteral(clonedDict);
  const contents = stream.getContents();
  return ctx.flateStream(contents, literal);
};

// ------------------------------------------------------------
// Extract object map from a PDFDocument
// ------------------------------------------------------------
export const rebuildPDFfromMap = async (
  objectMap: Map<PDFRef, any>,
  originalDoc: PDFDocument
): Promise<PDFDocument> => {
  const newDoc = await PDFDocument.create();
  const ctx = newDoc.context;

  // 1. Get Root and Pages refs from the ORIGINAL document
  const originalRootRef = originalDoc.context.trailerInfo.Root;
  const originalRootDict = originalDoc.context.lookup(originalRootRef, PDFDict);

  const originalCatalogRef = originalRootDict.get(PDFName.of('Catalog'))
  const originalPagesRef = originalRootDict.get(PDFName.of('Pages'));

  // 2. Clone everything EXCEPT the Pages tree
  for (const [ref, obj] of objectMap.entries()) {

    if (ref === originalCatalogRef) {

      ctx.assign(ref, obj);
      continue;
    }

    if (ref === originalPagesRef) {
      // Copy Pages tree dictionary as-is
      ctx.assign(ref, obj);
      continue;
    }

    const cloned = cloneObject(obj, ctx);
    ctx.assign(ref, cloned);
  }

  // 3. Restore the trailer Root
  ctx.trailerInfo.Root = originalRootRef;

  const test = newDoc.save();
  return newDoc;
};


// ------------------------------------------------------------
// Exported entry point
// ------------------------------------------------------------
export const debugPagesTree = (ctx: PDFContext) => {
  const rootRef = ctx.trailerInfo.Root;
  const rootDict = ctx.lookup(rootRef, PDFDict);

  const pagesRef = rootDict.get(PDFName.of('Pages')) as PDFRef;
  const temp = rootDict.asMap();
  const pagesDict = ctx.lookup(pagesRef, PDFDict);

  console.log("=== Pages Tree Debug ===");
  walkNode(ctx, pagesRef, pagesDict, 0);
};

// ------------------------------------------------------------
// Safe helper to extract a string from a PDFName
// ------------------------------------------------------------
export const getNameString = (obj: PDFObject | undefined): string | undefined => {
  return obj instanceof PDFName ? obj.asString() : undefined;
};

// ------------------------------------------------------------
// Recursive walker (mirrors pdf-lib's traversal)
// ------------------------------------------------------------
export const walkNode = (
  ctx: PDFContext,
  ref: PDFRef,
  dict: PDFDict,
  depth: number
) => {
  const indent = "  ".repeat(depth);

  const typeObj = dict.get(PDFName.of('Type'));
  const type = getNameString(typeObj);

  const kids = dict.get(PDFName.of('Kids'));
  const count = dict.get(PDFName.of('Count'));
  const parent = dict.get(PDFName.of('Parent'));

  console.log(`${indent}- Node ${ref.toString()}`);
  console.log(`${indent}  Type: ${type}`);
  console.log(`${indent}  Count: ${count instanceof PDFObject ? (count as any).value : "none"}`);
  console.log(`${indent}  Kids: ${kids instanceof PDFArray ? kids.size() : "none"}`);
  console.log(`${indent}  Parent: ${parent instanceof PDFRef ? parent.toString() : "none"}`);

  validateNode(dict, ref, depth);

  if (kids instanceof PDFArray) {
    for (const kid of kids.asArray()) {
      if (!(kid instanceof PDFRef)) {
        console.error(`${indent}  ❌ Kid is not a PDFRef`, kid);
        continue;
      }

      const kidDict = ctx.lookup(kid, PDFDict);
      walkNode(ctx, kid, kidDict, depth + 1);
    }
  }
};

// ------------------------------------------------------------
// Node validator (checks all invariants pdf-lib requires)
// ------------------------------------------------------------
export const validateNode = (
  dict: PDFDict,
  ref: PDFRef,
  depth: number
) => {
  const indent = "  ".repeat(depth);

  const typeObj = dict.get(PDFName.of('Type'));
  const type = getNameString(typeObj)?.replace('/', '').trim();

  const kids = dict.get(PDFName.of('Kids'));
  const count = dict.get(PDFName.of('Count'));

  if (!type) {
    console.error(`${indent}❌ Missing /Type in node ${ref}`);
    return;
  }

  if (type !== 'Pages' && type !== 'Page') {
    console.error(`${indent}❌ Invalid /Type (${type}) in node ${ref}`);
  }

  if (type === 'Pages') {
    if (!(kids instanceof PDFArray)) {
      console.error(`${indent}❌ Pages node ${ref} missing /Kids array`);
    }
    if (!count) {
      console.error(`${indent}❌ Pages node ${ref} missing /Count`);
    }
  }

  if (type === 'Page') {
    const parent = dict.get(PDFName.of('Parent'));
    if (!(parent instanceof PDFRef)) {
      console.error(`${indent}❌ Page node ${ref} missing /Parent ref`);
    }
  }
};



