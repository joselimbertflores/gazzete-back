import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function IsBeforeOrEqual(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBeforeOrEqual',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];

          // 👉 dejamos que @IsDate maneje null/undefined
          if (!value || !relatedValue) return true;

          // 👉 seguridad extra (evita comparar strings)
          if (!(value instanceof Date) || !(relatedValue instanceof Date)) {
            return true;
          }

          return value.getTime() <= relatedValue.getTime();
        },

        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          return `${args.property} debe ser menor o igual a ${relatedPropertyName}`;
        },
      },
    });
  };
}

export function IsAfterOrEqual(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAfterOrEqual',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];

          if (!value || !relatedValue) return true;

          if (!(value instanceof Date) || !(relatedValue instanceof Date)) {
            return true;
          }

          return value.getTime() >= relatedValue.getTime();
        },

        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          return `${args.property} debe ser mayor o igual a ${relatedPropertyName}`;
        },
      },
    });
  };
}
