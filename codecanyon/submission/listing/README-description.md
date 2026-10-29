# Regenerating the item description

```bash
python3 resolve-description.py https://your-host/path/to/exports
```

`description-template.html` is the source. It holds, in order:

1. the `<h2>` heading and the four intro paragraphs,
2. the 25 feature panels as `{{PUBLIC_ASSET_BASE}}/NN-name.jpg` images,
3. the `Installation and setup` section as plain text.

All three must stay. The intro was once missing from the template, so regenerating
silently dropped the heading and the opening copy. The setup section must stay as text,
not a link: Envato soft-rejected the first submission for pointing at an externally
hosted setup guide, so never reintroduce a link to one.

Output is byte-identical to what is published: 9,902 characters. If `description-final.html`
comes out a different length, something has been lost — check the three parts above before
pasting it into the item form.
