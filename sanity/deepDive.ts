import { defineArrayMember, defineField, defineType } from 'sanity';

export const engineeringCode = defineType({
  name: 'engineeringCode',
  title: 'Code example',
  type: 'object',
  fields: [
    defineField({ name: 'label', title: 'Caption', type: 'string' }),
    defineField({
      name: 'language', type: 'string', initialValue: 'typescript',
      options: { list: ['typescript', 'javascript', 'shell', 'diff', 'text'] },
      validation: (rule) => rule.required(),
    }),
    defineField({ name: 'code', type: 'text', rows: 14, validation: (rule) => rule.required() }),
  ],
  preview: { select: { title: 'label', subtitle: 'language' } },
});

export const engineeringDeepDive = defineType({
  name: 'engineeringDeepDive',
  title: 'Engineering deep dive',
  type: 'object',
  fields: [
    defineField({ name: 'title', type: 'string', validation: (rule) => rule.required() }),
    defineField({ name: 'teaser', type: 'text', rows: 2, description: 'Optional; omit for a compact code accordion.' }),
    defineField({
      name: 'body', type: 'array',
      of: [
        defineArrayMember({
          type: 'block',
          styles: [{ title: 'Normal', value: 'normal' }, { title: 'Small heading', value: 'h3' }],
          lists: [],
          marks: { decorators: [{ title: 'Code', value: 'code' }], annotations: [] },
        }),
        defineArrayMember({ type: 'engineeringCode' }),
      ],
      validation: (rule) => rule.required().min(1),
    }),
  ],
  preview: { select: { title: 'title', subtitle: 'teaser' } },
});
