import { dereference } from 'json-schema-ref-parser';
import { decycle } from '@stoplight/json';
import { get, camelCase, forOwn } from 'lodash';
import jsf from 'json-schema-faker';

// declare module 'json-schema-faker' {
//   let locate: any, option: any;
// }

export async function configureExtensionsFromSpec(
  specFilePathOrObject: string | any,
): Promise<void> {
  const result = decycle(await dereference(specFilePathOrObject));

  forOwn(
    get(result, 'x-json-schema-faker', {}),
    (value: any, option: string) => {
      if (option === 'locale') return jsf.locate('faker').setLocale(value);

      jsf.option(camelCase(option), value);
    },
  );
}
