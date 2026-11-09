# Shared web/mobile strings

`core.tsv` is the handoff for Adil: stable key, English, Russian and Kazakh
wording, in that order. It includes the merged backend's notification wording.
No GitHub comment or external message has been sent.

The generated runtime files are `src/i18n/locales/{en,ru,kk}.json`. After editing
the TSV, run `npm run translations:build`. New interface code uses `t(key, values)`
and subscribes with `useLocale()` so language changes preserve form state.
Keep placeholders identical in all three languages. Do not translate request
fields, status codes, option values, URLs, IDs or user-authored content.

`quantityLabel()` uses Intl plural rules, including Russian one/few/many forms.
Dates, money and categories use the chosen locale. The profile is authoritative
after session restoration; anonymous choices are cached locally. Signed-in
switches are applied after the profile update succeeds.

`npm run translations:audit` checks interface literals. New strings must be moved
to the catalog; the same check runs in the test suite. The reviewed exceptions
in `technical-strings.json` are code, formatting, product names and example
addresses, each with a reason. This is a source check, not a browser screenshot
or screen-reader certification.

Known notifications are rendered from their safe payload in the current locale,
using the same wording as the backend. Unknown future notification kinds retain
the server's text. Names, event descriptions, staff explanations, support messages,
custom seat-category names and unknown future backend codes remain original data.
Known paid-sales terms are translated verbatim; a changed server version retains
its original text until its translation is reviewed.
