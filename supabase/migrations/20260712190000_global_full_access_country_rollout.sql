-- Global full-access country rollout.
-- Every dialing-profile country becomes a first-class market in the database:
--   1. Seeds all countries into kunthai_countries (dial code, currency, locale).
--   2. Adds per-country transport capabilities (ride vs delivery fleet types)
--      and validates fleets against them in the database.
--   3. Enables every feature for every country; gating stays enforceable by
--      flipping kunthai_country_feature_settings rows.
--   4. Currency fallback resolves through the default country row.
--   5. Adds the client bootstrap RPC the frontend hydrates from.
--   6. Advert campaign creation respects per-country feature settings.

-- 1) Transport capability columns ------------------------------------------

alter table public.kunthai_countries
  add column if not exists ride_fleet_types text[] not null default array['motorcycle','tricycle','car'],
  add column if not exists delivery_fleet_types text[] not null default array['motorcycle','tricycle','van'];

-- 2) Seed every country ------------------------------------------------------
-- Existing rows keep their curated data; only blank dial codes are filled in.

insert into public.kunthai_countries (iso2, name, dial_code, currency_code, locale) values
  ('AC', 'Ascension Island', '+247', 'SHP', 'en-AC'),
  ('AD', 'Andorra', '+376', 'EUR', 'en-AD'),
  ('AE', 'United Arab Emirates', '+971', 'AED', 'en-AE'),
  ('AF', 'Afghanistan', '+93', 'AFN', 'en-AF'),
  ('AG', 'Antigua and Barbuda', '+1', 'XCD', 'en-AG'),
  ('AI', 'Anguilla', '+1', 'XCD', 'en-AI'),
  ('AL', 'Albania', '+355', 'ALL', 'en-AL'),
  ('AM', 'Armenia', '+374', 'AMD', 'en-AM'),
  ('AO', 'Angola', '+244', 'AOA', 'en-AO'),
  ('AQ', 'Antarctica', '+672', 'USD', 'en-AQ'),
  ('AR', 'Argentina', '+54', 'ARS', 'en-AR'),
  ('AS', 'American Samoa', '+1', 'USD', 'en-AS'),
  ('AT', 'Austria', '+43', 'EUR', 'en-AT'),
  ('AU', 'Australia', '+61', 'AUD', 'en-AU'),
  ('AW', 'Aruba', '+297', 'AWG', 'en-AW'),
  ('AX', 'Aland Islands', '+358', 'EUR', 'en-AX'),
  ('AZ', 'Azerbaijan', '+994', 'AZN', 'en-AZ'),
  ('BA', 'Bosnia and Herzegovina', '+387', 'BAM', 'en-BA'),
  ('BB', 'Barbados', '+1', 'BBD', 'en-BB'),
  ('BD', 'Bangladesh', '+880', 'BDT', 'en-BD'),
  ('BE', 'Belgium', '+32', 'EUR', 'en-BE'),
  ('BF', 'Burkina Faso', '+226', 'XOF', 'en-BF'),
  ('BG', 'Bulgaria', '+359', 'BGN', 'en-BG'),
  ('BH', 'Bahrain', '+973', 'BHD', 'en-BH'),
  ('BI', 'Burundi', '+257', 'BIF', 'en-BI'),
  ('BJ', 'Benin', '+229', 'XOF', 'en-BJ'),
  ('BL', 'Saint Barthelemy', '+590', 'EUR', 'en-BL'),
  ('BM', 'Bermuda', '+1', 'BMD', 'en-BM'),
  ('BN', 'Brunei', '+673', 'BND', 'en-BN'),
  ('BO', 'Bolivia', '+591', 'BOB', 'en-BO'),
  ('BQ', 'Bonaire, Sint Eustatius and Saba', '+599', 'USD', 'en-BQ'),
  ('BR', 'Brazil', '+55', 'BRL', 'en-BR'),
  ('BS', 'Bahamas', '+1', 'BSD', 'en-BS'),
  ('BT', 'Bhutan', '+975', 'BTN', 'en-BT'),
  ('BV', 'Bouvet Island', '+47', 'NOK', 'en-BV'),
  ('BW', 'Botswana', '+267', 'BWP', 'en-BW'),
  ('BY', 'Belarus', '+375', 'BYN', 'en-BY'),
  ('BZ', 'Belize', '+501', 'BZD', 'en-BZ'),
  ('CA', 'Canada', '+1', 'CAD', 'en-CA'),
  ('CC', 'Cocos Islands', '+61', 'AUD', 'en-CC'),
  ('CD', 'Democratic Republic of the Congo', '+243', 'CDF', 'en-CD'),
  ('CF', 'Central African Republic', '+236', 'XAF', 'en-CF'),
  ('CG', 'Republic of the Congo', '+242', 'XAF', 'en-CG'),
  ('CH', 'Switzerland', '+41', 'CHF', 'en-CH'),
  ('CI', 'Ivory Coast', '+225', 'XOF', 'en-CI'),
  ('CK', 'Cook Islands', '+682', 'NZD', 'en-CK'),
  ('CL', 'Chile', '+56', 'CLP', 'en-CL'),
  ('CM', 'Cameroon', '+237', 'XAF', 'en-CM'),
  ('CN', 'China', '+86', 'CNY', 'en-CN'),
  ('CO', 'Colombia', '+57', 'COP', 'en-CO'),
  ('CR', 'Costa Rica', '+506', 'CRC', 'en-CR'),
  ('CU', 'Cuba', '+53', 'CUP', 'en-CU'),
  ('CV', 'Cape Verde', '+238', 'CVE', 'en-CV'),
  ('CW', 'Curacao', '+599', 'ANG', 'en-CW'),
  ('CX', 'Christmas Island', '+61', 'AUD', 'en-CX'),
  ('CY', 'Cyprus', '+357', 'EUR', 'en-CY'),
  ('CZ', 'Czechia', '+420', 'CZK', 'en-CZ'),
  ('DE', 'Germany', '+49', 'EUR', 'en-DE'),
  ('DJ', 'Djibouti', '+253', 'DJF', 'en-DJ'),
  ('DK', 'Denmark', '+45', 'DKK', 'en-DK'),
  ('DM', 'Dominica', '+1', 'XCD', 'en-DM'),
  ('DO', 'Dominican Republic', '+1', 'DOP', 'en-DO'),
  ('DZ', 'Algeria', '+213', 'DZD', 'en-DZ'),
  ('EC', 'Ecuador', '+593', 'USD', 'en-EC'),
  ('EE', 'Estonia', '+372', 'EUR', 'en-EE'),
  ('EG', 'Egypt', '+20', 'EGP', 'en-EG'),
  ('EH', 'Western Sahara', '+212', 'MAD', 'en-EH'),
  ('ER', 'Eritrea', '+291', 'ERN', 'en-ER'),
  ('ES', 'Spain', '+34', 'EUR', 'en-ES'),
  ('ET', 'Ethiopia', '+251', 'ETB', 'en-ET'),
  ('FI', 'Finland', '+358', 'EUR', 'en-FI'),
  ('FJ', 'Fiji', '+679', 'FJD', 'en-FJ'),
  ('FK', 'Falkland Islands', '+500', 'FKP', 'en-FK'),
  ('FM', 'Micronesia', '+691', 'USD', 'en-FM'),
  ('FO', 'Faroe Islands', '+298', 'DKK', 'en-FO'),
  ('FR', 'France', '+33', 'EUR', 'en-FR'),
  ('GA', 'Gabon', '+241', 'XAF', 'en-GA'),
  ('GB', 'United Kingdom', '+44', 'GBP', 'en-GB'),
  ('GD', 'Grenada', '+1', 'XCD', 'en-GD'),
  ('GE', 'Georgia', '+995', 'GEL', 'en-GE'),
  ('GF', 'French Guiana', '+594', 'EUR', 'en-GF'),
  ('GG', 'Guernsey', '+44', 'GBP', 'en-GG'),
  ('GH', 'Ghana', '+233', 'GHS', 'en-GH'),
  ('GI', 'Gibraltar', '+350', 'GIP', 'en-GI'),
  ('GL', 'Greenland', '+299', 'DKK', 'en-GL'),
  ('GM', 'The Gambia', '+220', 'GMD', 'en-GM'),
  ('GN', 'Guinea', '+224', 'GNF', 'en-GN'),
  ('GP', 'Guadeloupe', '+590', 'EUR', 'en-GP'),
  ('GQ', 'Equatorial Guinea', '+240', 'XAF', 'en-GQ'),
  ('GR', 'Greece', '+30', 'EUR', 'en-GR'),
  ('GS', 'South Georgia and the South Sandwich Islands', '+500', 'GBP', 'en-GS'),
  ('GT', 'Guatemala', '+502', 'GTQ', 'en-GT'),
  ('GU', 'Guam', '+1', 'USD', 'en-GU'),
  ('GW', 'Guinea-Bissau', '+245', 'XOF', 'en-GW'),
  ('GY', 'Guyana', '+592', 'GYD', 'en-GY'),
  ('HK', 'Hong Kong', '+852', 'HKD', 'en-HK'),
  ('HM', 'Heard Island and McDonald Islands', '+672', 'AUD', 'en-HM'),
  ('HN', 'Honduras', '+504', 'HNL', 'en-HN'),
  ('HR', 'Croatia', '+385', 'EUR', 'en-HR'),
  ('HT', 'Haiti', '+509', 'HTG', 'en-HT'),
  ('HU', 'Hungary', '+36', 'HUF', 'en-HU'),
  ('ID', 'Indonesia', '+62', 'IDR', 'en-ID'),
  ('IE', 'Ireland', '+353', 'EUR', 'en-IE'),
  ('IL', 'Israel', '+972', 'ILS', 'en-IL'),
  ('IM', 'Isle of Man', '+44', 'GBP', 'en-IM'),
  ('IN', 'India', '+91', 'INR', 'en-IN'),
  ('IO', 'British Indian Ocean Territory', '+246', 'USD', 'en-IO'),
  ('IQ', 'Iraq', '+964', 'IQD', 'en-IQ'),
  ('IR', 'Iran', '+98', 'IRR', 'en-IR'),
  ('IS', 'Iceland', '+354', 'ISK', 'en-IS'),
  ('IT', 'Italy', '+39', 'EUR', 'en-IT'),
  ('JE', 'Jersey', '+44', 'GBP', 'en-JE'),
  ('JM', 'Jamaica', '+1', 'JMD', 'en-JM'),
  ('JO', 'Jordan', '+962', 'JOD', 'en-JO'),
  ('JP', 'Japan', '+81', 'JPY', 'en-JP'),
  ('KE', 'Kenya', '+254', 'KES', 'en-KE'),
  ('KG', 'Kyrgyzstan', '+996', 'KGS', 'en-KG'),
  ('KH', 'Cambodia', '+855', 'KHR', 'en-KH'),
  ('KI', 'Kiribati', '+686', 'AUD', 'en-KI'),
  ('KM', 'Comoros', '+269', 'KMF', 'en-KM'),
  ('KN', 'Saint Kitts and Nevis', '+1', 'XCD', 'en-KN'),
  ('KP', 'North Korea', '+850', 'KPW', 'en-KP'),
  ('KR', 'South Korea', '+82', 'KRW', 'en-KR'),
  ('KW', 'Kuwait', '+965', 'KWD', 'en-KW'),
  ('KY', 'Cayman Islands', '+1', 'KYD', 'en-KY'),
  ('KZ', 'Kazakhstan', '+7', 'KZT', 'en-KZ'),
  ('LA', 'Laos', '+856', 'LAK', 'en-LA'),
  ('LB', 'Lebanon', '+961', 'LBP', 'en-LB'),
  ('LC', 'Saint Lucia', '+1', 'XCD', 'en-LC'),
  ('LI', 'Liechtenstein', '+423', 'CHF', 'en-LI'),
  ('LK', 'Sri Lanka', '+94', 'LKR', 'en-LK'),
  ('LR', 'Liberia', '+231', 'LRD', 'en-LR'),
  ('LS', 'Lesotho', '+266', 'LSL', 'en-LS'),
  ('LT', 'Lithuania', '+370', 'EUR', 'en-LT'),
  ('LU', 'Luxembourg', '+352', 'EUR', 'en-LU'),
  ('LV', 'Latvia', '+371', 'EUR', 'en-LV'),
  ('LY', 'Libya', '+218', 'LYD', 'en-LY'),
  ('MA', 'Morocco', '+212', 'MAD', 'en-MA'),
  ('MC', 'Monaco', '+377', 'EUR', 'en-MC'),
  ('MD', 'Moldova', '+373', 'MDL', 'en-MD'),
  ('ME', 'Montenegro', '+382', 'EUR', 'en-ME'),
  ('MF', 'Saint Martin', '+590', 'EUR', 'en-MF'),
  ('MG', 'Madagascar', '+261', 'MGA', 'en-MG'),
  ('MH', 'Marshall Islands', '+692', 'USD', 'en-MH'),
  ('MK', 'North Macedonia', '+389', 'MKD', 'en-MK'),
  ('ML', 'Mali', '+223', 'XOF', 'en-ML'),
  ('MM', 'Myanmar', '+95', 'MMK', 'en-MM'),
  ('MN', 'Mongolia', '+976', 'MNT', 'en-MN'),
  ('MO', 'Macau', '+853', 'MOP', 'en-MO'),
  ('MP', 'Northern Mariana Islands', '+1', 'USD', 'en-MP'),
  ('MQ', 'Martinique', '+596', 'EUR', 'en-MQ'),
  ('MR', 'Mauritania', '+222', 'MRU', 'en-MR'),
  ('MS', 'Montserrat', '+1', 'XCD', 'en-MS'),
  ('MT', 'Malta', '+356', 'EUR', 'en-MT'),
  ('MU', 'Mauritius', '+230', 'MUR', 'en-MU'),
  ('MV', 'Maldives', '+960', 'MVR', 'en-MV'),
  ('MW', 'Malawi', '+265', 'MWK', 'en-MW'),
  ('MX', 'Mexico', '+52', 'MXN', 'en-MX'),
  ('MY', 'Malaysia', '+60', 'MYR', 'en-MY'),
  ('MZ', 'Mozambique', '+258', 'MZN', 'en-MZ'),
  ('NA', 'Namibia', '+264', 'NAD', 'en-NA'),
  ('NC', 'New Caledonia', '+687', 'XPF', 'en-NC'),
  ('NE', 'Niger', '+227', 'XOF', 'en-NE'),
  ('NF', 'Norfolk Island', '+672', 'AUD', 'en-NF'),
  ('NG', 'Nigeria', '+234', 'NGN', 'en-NG'),
  ('NI', 'Nicaragua', '+505', 'NIO', 'en-NI'),
  ('NL', 'Netherlands', '+31', 'EUR', 'en-NL'),
  ('NO', 'Norway', '+47', 'NOK', 'en-NO'),
  ('NP', 'Nepal', '+977', 'NPR', 'en-NP'),
  ('NR', 'Nauru', '+674', 'AUD', 'en-NR'),
  ('NU', 'Niue', '+683', 'NZD', 'en-NU'),
  ('NZ', 'New Zealand', '+64', 'NZD', 'en-NZ'),
  ('OM', 'Oman', '+968', 'OMR', 'en-OM'),
  ('PA', 'Panama', '+507', 'PAB', 'en-PA'),
  ('PE', 'Peru', '+51', 'PEN', 'en-PE'),
  ('PF', 'French Polynesia', '+689', 'XPF', 'en-PF'),
  ('PG', 'Papua New Guinea', '+675', 'PGK', 'en-PG'),
  ('PH', 'Philippines', '+63', 'PHP', 'en-PH'),
  ('PK', 'Pakistan', '+92', 'PKR', 'en-PK'),
  ('PL', 'Poland', '+48', 'PLN', 'en-PL'),
  ('PM', 'Saint Pierre and Miquelon', '+508', 'EUR', 'en-PM'),
  ('PN', 'Pitcairn Islands', '+64', 'NZD', 'en-PN'),
  ('PR', 'Puerto Rico', '+1', 'USD', 'en-PR'),
  ('PS', 'Palestine', '+970', 'ILS', 'en-PS'),
  ('PT', 'Portugal', '+351', 'EUR', 'en-PT'),
  ('PW', 'Palau', '+680', 'USD', 'en-PW'),
  ('PY', 'Paraguay', '+595', 'PYG', 'en-PY'),
  ('QA', 'Qatar', '+974', 'QAR', 'en-QA'),
  ('RE', 'Reunion', '+262', 'EUR', 'en-RE'),
  ('RO', 'Romania', '+40', 'RON', 'en-RO'),
  ('RS', 'Serbia', '+381', 'RSD', 'en-RS'),
  ('RU', 'Russia', '+7', 'RUB', 'en-RU'),
  ('RW', 'Rwanda', '+250', 'RWF', 'en-RW'),
  ('SA', 'Saudi Arabia', '+966', 'SAR', 'en-SA'),
  ('SB', 'Solomon Islands', '+677', 'SBD', 'en-SB'),
  ('SC', 'Seychelles', '+248', 'SCR', 'en-SC'),
  ('SD', 'Sudan', '+249', 'SDG', 'en-SD'),
  ('SE', 'Sweden', '+46', 'SEK', 'en-SE'),
  ('SG', 'Singapore', '+65', 'SGD', 'en-SG'),
  ('SH', 'Saint Helena', '+290', 'SHP', 'en-SH'),
  ('SI', 'Slovenia', '+386', 'EUR', 'en-SI'),
  ('SJ', 'Svalbard and Jan Mayen', '+47', 'NOK', 'en-SJ'),
  ('SK', 'Slovakia', '+421', 'EUR', 'en-SK'),
  ('SL', 'Sierra Leone', '+232', 'SLE', 'en-SL'),
  ('SM', 'San Marino', '+378', 'EUR', 'en-SM'),
  ('SN', 'Senegal', '+221', 'XOF', 'en-SN'),
  ('SO', 'Somalia', '+252', 'SOS', 'en-SO'),
  ('SR', 'Suriname', '+597', 'SRD', 'en-SR'),
  ('SS', 'South Sudan', '+211', 'SSP', 'en-SS'),
  ('ST', 'Sao Tome and Principe', '+239', 'STN', 'en-ST'),
  ('SV', 'El Salvador', '+503', 'USD', 'en-SV'),
  ('SX', 'Sint Maarten', '+1', 'ANG', 'en-SX'),
  ('SY', 'Syria', '+963', 'SYP', 'en-SY'),
  ('SZ', 'Eswatini', '+268', 'SZL', 'en-SZ'),
  ('TA', 'Tristan da Cunha', '+290', 'SHP', 'en-TA'),
  ('TC', 'Turks and Caicos Islands', '+1', 'USD', 'en-TC'),
  ('TD', 'Chad', '+235', 'XAF', 'en-TD'),
  ('TF', 'French Southern Territories', '+262', 'EUR', 'en-TF'),
  ('TG', 'Togo', '+228', 'XOF', 'en-TG'),
  ('TH', 'Thailand', '+66', 'THB', 'en-TH'),
  ('TJ', 'Tajikistan', '+992', 'TJS', 'en-TJ'),
  ('TK', 'Tokelau', '+690', 'NZD', 'en-TK'),
  ('TL', 'Timor-Leste', '+670', 'USD', 'en-TL'),
  ('TM', 'Turkmenistan', '+993', 'TMT', 'en-TM'),
  ('TN', 'Tunisia', '+216', 'TND', 'en-TN'),
  ('TO', 'Tonga', '+676', 'TOP', 'en-TO'),
  ('TR', 'Turkiye', '+90', 'TRY', 'en-TR'),
  ('TT', 'Trinidad and Tobago', '+1', 'TTD', 'en-TT'),
  ('TV', 'Tuvalu', '+688', 'AUD', 'en-TV'),
  ('TW', 'Taiwan', '+886', 'TWD', 'en-TW'),
  ('TZ', 'Tanzania', '+255', 'TZS', 'en-TZ'),
  ('UA', 'Ukraine', '+380', 'UAH', 'en-UA'),
  ('UG', 'Uganda', '+256', 'UGX', 'en-UG'),
  ('UM', 'United States Minor Outlying Islands', '+1', 'USD', 'en-UM'),
  ('US', 'United States', '+1', 'USD', 'en-US'),
  ('UY', 'Uruguay', '+598', 'UYU', 'en-UY'),
  ('UZ', 'Uzbekistan', '+998', 'UZS', 'en-UZ'),
  ('VA', 'Vatican City', '+39', 'EUR', 'en-VA'),
  ('VC', 'Saint Vincent and the Grenadines', '+1', 'XCD', 'en-VC'),
  ('VE', 'Venezuela', '+58', 'VES', 'en-VE'),
  ('VG', 'British Virgin Islands', '+1', 'USD', 'en-VG'),
  ('VI', 'U.S. Virgin Islands', '+1', 'USD', 'en-VI'),
  ('VN', 'Vietnam', '+84', 'VND', 'en-VN'),
  ('VU', 'Vanuatu', '+678', 'VUV', 'en-VU'),
  ('WF', 'Wallis and Futuna', '+681', 'XPF', 'en-WF'),
  ('WS', 'Samoa', '+685', 'WST', 'en-WS'),
  ('XK', 'Kosovo', '+383', 'EUR', 'en-XK'),
  ('YE', 'Yemen', '+967', 'YER', 'en-YE'),
  ('YT', 'Mayotte', '+262', 'EUR', 'en-YT'),
  ('ZA', 'South Africa', '+27', 'ZAR', 'en-ZA'),
  ('ZM', 'Zambia', '+260', 'ZMW', 'en-ZM'),
  ('ZW', 'Zimbabwe', '+263', 'ZWL', 'en-ZW')
on conflict (iso2) do update set
  dial_code = case
    when public.kunthai_countries.dial_code = '' then excluded.dial_code
    else public.kunthai_countries.dial_code
  end,
  updated_at = now();

-- 3) Every country is an active market -------------------------------------

update public.kunthai_countries
set market_status = 'active', updated_at = now()
where market_status <> 'active';

-- Regulated ride markets: rides are taxi-only, deliveries keep bike + van.

update public.kunthai_countries
set
  ride_fleet_types = array['car'],
  delivery_fleet_types = array['motorcycle','van'],
  updated_at = now()
where iso2 in (
  'AD','AE','AT','AU','BE','CA','CH','CY','CZ','DE','DK','EE',
  'ES','FI','FR','GB','GR','HK','HR','IE','IL','IS','IT','JP',
  'KR','KW','LI','LT','LU','LV','MC','MT','NL','NO','NZ','PL',
  'PT','QA','SA','SE','SG','SI','SK','SM','TW','US','VA'
);

-- 4) Enable every feature everywhere ----------------------------------------
-- Full global access; per-country gating is now a database decision that the
-- app (frontend and backend) actually honors.

with feature_defaults(feature_key) as (
  values
    ('explore'), ('urfeed'), ('swip'), ('direct_messages'), ('voice_notes'),
    ('media_uploads'), ('your_say'), ('urmall'), ('seller_registration'),
    ('transport_booking'), ('driver_registration'), ('company_registration'),
    ('adverts'), ('phone_authentication'), ('emergency_assistance')
)
insert into public.kunthai_country_feature_settings (
  country_iso, feature_key, enabled, status, rollout_note
)
select country.iso2, feature.feature_key, true, 'available', ''
from public.kunthai_countries country
cross join feature_defaults feature
on conflict (country_iso, feature_key) do update set
  enabled = true,
  status = 'available',
  rollout_note = '',
  updated_at = now();

-- 5) Currency fallback resolves through the default country row -------------

create or replace function public.kunthai_resolve_currency(
  country_value text default null,
  currency_value text default null
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  supplied_currency text := upper(btrim(coalesce(currency_value, '')));
  resolved_iso text;
  resolved_currency text;
begin
  if supplied_currency ~ '^[A-Z]{3,5}$' then
    return supplied_currency;
  end if;

  resolved_iso := public.kunthai_resolve_country_iso(country_value);

  select country.currency_code into resolved_currency
  from public.kunthai_countries country
  where country.iso2 = resolved_iso
  limit 1;

  if resolved_currency is null then
    select country.currency_code into resolved_currency
    from public.kunthai_countries country
    where country.iso2 = public.kunthai_default_country_iso()
    limit 1;
  end if;

  return coalesce(resolved_currency, 'SLE');
end;
$$;

-- 6) Feature lookup falls back to the default country's row -----------------
-- Prevents unknown or unseeded ISO codes from silently disabling features.

create or replace function public.kunthai_country_feature_enabled(
  country_value text,
  feature_value text
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  resolved_iso text := public.kunthai_resolve_country_iso(country_value);
  normalized_feature text := lower(btrim(coalesce(feature_value, '')));
  feature_enabled boolean;
begin
  if normalized_feature = '' then
    return false;
  end if;

  select setting.enabled into feature_enabled
  from public.kunthai_country_feature_settings setting
  where setting.country_iso = resolved_iso
    and setting.feature_key = normalized_feature
  limit 1;

  if feature_enabled is null then
    select setting.enabled into feature_enabled
    from public.kunthai_country_feature_settings setting
    where setting.country_iso = public.kunthai_default_country_iso()
      and setting.feature_key = normalized_feature
    limit 1;
  end if;

  return coalesce(feature_enabled, false);
end;
$$;

-- 7) Client bootstrap RPC ----------------------------------------------------
-- One round trip returns every country with its features and transport rules.

create or replace function public.kunthai_get_client_country_config()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'defaultCountry', public.kunthai_default_country_iso(),
    'generatedAt', timezone('utc', now()),
    'countries', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'iso2', country.iso2,
          'name', country.name,
          'dialCode', country.dial_code,
          'currencyCode', country.currency_code,
          'currencyName', country.currency_name,
          'currencySymbol', country.currency_symbol,
          'locale', country.locale,
          'marketStatus', country.market_status,
          'rideFleetTypes', to_jsonb(country.ride_fleet_types),
          'deliveryFleetTypes', to_jsonb(country.delivery_fleet_types),
          'features', coalesce(feature_map.features, '{}'::jsonb)
        )
        order by country.name
      ),
      '[]'::jsonb
    )
  )
  from public.kunthai_countries country
  left join (
    select setting.country_iso, jsonb_object_agg(setting.feature_key, setting.enabled) as features
    from public.kunthai_country_feature_settings setting
    group by setting.country_iso
  ) feature_map on feature_map.country_iso = country.iso2;
$$;

grant execute on function public.kunthai_get_client_country_config() to anon, authenticated;

-- 8) Country-aware fleet-type validation ------------------------------------

create or replace function public.kunthai_fleet_type_allowed(
  country_value text,
  fleet_type_value text,
  purpose_value text
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  resolved_iso text := public.kunthai_resolve_country_iso(country_value);
  normalized_type text := lower(btrim(coalesce(fleet_type_value, '')));
  normalized_purpose text := lower(btrim(coalesce(purpose_value, '')));
  ride_types text[];
  delivery_types text[];
begin
  if normalized_type in ('motorbike', 'bike', 'okada') then
    normalized_type := 'motorcycle';
  elsif normalized_type in ('keke', 'auto', 'autorickshaw') then
    normalized_type := 'tricycle';
  elsif normalized_type in ('taxi', 'bus', 'minibus') then
    normalized_type := 'car';
  end if;

  select country.ride_fleet_types, country.delivery_fleet_types
  into ride_types, delivery_types
  from public.kunthai_countries country
  where country.iso2 = resolved_iso;

  -- Unknown countries never hard-block operators.
  if ride_types is null then
    return true;
  end if;

  if normalized_purpose = 'ride' then
    return normalized_type = any(ride_types)
      or (normalized_type = 'van' and 'car' = any(ride_types));
  end if;

  if normalized_purpose = 'delivery' then
    return normalized_type = any(delivery_types)
      or (normalized_type = 'car' and 'van' = any(delivery_types))
      or (normalized_type = 'van' and 'car' = any(delivery_types));
  end if;

  return public.kunthai_fleet_type_allowed(resolved_iso, normalized_type, 'ride')
    or public.kunthai_fleet_type_allowed(resolved_iso, normalized_type, 'delivery');
end;
$$;

grant execute on function public.kunthai_fleet_type_allowed(text, text, text) to anon, authenticated;

create or replace function public.transport_enforce_country_fleet_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  country_context text := coalesce(nullif(new.country_iso, ''), nullif(new.country, ''));
  fleet_label text := initcap(coalesce(new.fleet_type::text, 'fleet'));
begin
  if coalesce(new.accepts_ride, false)
     and not public.kunthai_fleet_type_allowed(country_context, new.fleet_type::text, 'ride') then
    raise exception '% fleets cannot accept ride requests in this country.', fleet_label;
  end if;

  if coalesce(new.accepts_delivery, false)
     and not public.kunthai_fleet_type_allowed(country_context, new.fleet_type::text, 'delivery') then
    raise exception '% fleets cannot accept delivery requests in this country.', fleet_label;
  end if;

  if not coalesce(new.accepts_ride, false)
     and not coalesce(new.accepts_delivery, false)
     and not public.kunthai_fleet_type_allowed(country_context, new.fleet_type::text, 'any') then
    raise exception '% fleets are not available in this country.', fleet_label;
  end if;

  return new;
end;
$$;

create or replace function public.transport_company_fleets_country_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  company_country text;
  service_key text := lower(btrim(coalesce(new.service_category, '')));
  fleet_label text := coalesce(nullif(btrim(new.fleet_type), ''), 'This fleet type');
begin
  select coalesce(nullif(company.country_iso, ''), nullif(company.country, ''))
  into company_country
  from public.transport_companies company
  where company.id = new.company_id;

  if service_key in ('ride only', 'ride and delivery')
     and not public.kunthai_fleet_type_allowed(company_country, new.fleet_type, 'ride') then
    raise exception '% fleets cannot offer rides in this country.', fleet_label;
  end if;

  if service_key in ('delivery only', 'ride and delivery')
     and not public.kunthai_fleet_type_allowed(company_country, new.fleet_type, 'delivery') then
    raise exception '% fleets cannot offer deliveries in this country.', fleet_label;
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.transport_fleets') is not null then
    execute 'drop trigger if exists transport_fleets_country_fleet_rules on public.transport_fleets';
    execute 'create trigger transport_fleets_country_fleet_rules
      before insert or update of fleet_type, accepts_ride, accepts_delivery, country_iso, country
      on public.transport_fleets
      for each row execute function public.transport_enforce_country_fleet_rules()';
  end if;

  if to_regclass('public.transport_company_fleets') is not null then
    execute 'drop trigger if exists transport_company_fleets_country_rules on public.transport_company_fleets';
    execute 'create trigger transport_company_fleets_country_rules
      before insert or update of fleet_type, service_category, company_id
      on public.transport_company_fleets
      for each row execute function public.transport_company_fleets_country_rules()';
  end if;
end;
$$;

-- 9) Advert campaigns honor per-country feature settings ---------------------

create or replace function public.create_explore_ad_campaign(
  p_post_id uuid,
  p_placement text default 'urfeed',
  p_objective text default 'brand_awareness',
  p_audience_type text default 'recommended',
  p_minimum_age integer default 13,
  p_maximum_age integer default null,
  p_gender_target text default 'all',
  p_interest_categories text[] default '{}',
  p_target_area text default null,
  p_duration_days integer default 14,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_budget_type text default 'total',
  p_budget_amount numeric default 0,
  p_currency text default null
)
returns public.explore_ad_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.explore_posts;
  v_start timestamptz := coalesce(p_starts_at, timezone('utc', now()));
  v_end timestamptz;
  v_campaign public.explore_ad_campaigns;
  v_post_safe boolean;
  v_advertiser_country text;
  v_currency text;
begin
  v_advertiser_country := public.kunthai_resolve_country_iso(
    coalesce(
      nullif(auth.jwt() -> 'user_metadata' ->> 'country_code', ''),
      nullif(auth.jwt() -> 'user_metadata' ->> 'country', ''),
      (
        select coalesce(
          nullif(auth_user.raw_user_meta_data ->> 'country_code', ''),
          nullif(auth_user.raw_user_meta_data ->> 'country', '')
        )
        from auth.users auth_user
        where auth_user.id = auth.uid()
      )
    )
  );

  if not public.kunthai_country_feature_enabled(v_advertiser_country, 'adverts') then
    raise exception 'Advertising is not yet available in your country.';
  end if;

  v_currency := public.kunthai_resolve_currency(v_advertiser_country, p_currency);

  select * into v_post from public.explore_posts where id = p_post_id;
  if v_post.id is null or v_post.user_id is distinct from auth.uid() then
    raise exception 'Advertisement creative was not found or is not owned by the current user';
  end if;

  if not (v_post.post_type = 'advert' or v_post.category = 'advert' or coalesce(v_post.media_meta, '{}'::jsonb) ? 'advert') then
    raise exception 'Only Explore advertisement creatives can create campaigns';
  end if;

  if p_placement in ('swip', 'both') and nullif(btrim(coalesce(v_post.video_url, '')), '') is null then
    raise exception 'Swip placement requires a reviewed video';
  end if;

  if p_placement in ('urfeed', 'both')
    and nullif(btrim(coalesce(v_post.video_url, '')), '') is not null
    and nullif(btrim(coalesce(v_post.image_url, '')), '') is null
  then
    raise exception 'UrFeed placement for a video advertisement requires an image';
  end if;

  v_end := coalesce(p_ends_at, v_start + make_interval(days => greatest(1, least(coalesce(p_duration_days, 14), 365))));
  v_post_safe := coalesce(v_post.moderation_status, 'not_required') in ('not_required', 'approved', 'legacy');

  insert into public.explore_ad_campaigns (
    creative_post_id, advertiser_id, placement, objective, audience_type,
    minimum_age, maximum_age, gender_target, interest_categories, target_area,
    duration_days, starts_at, ends_at, budget_type, budget_amount, currency,
    status, moderation_status, updated_at
  ) values (
    v_post.id, auth.uid(), lower(coalesce(p_placement, 'urfeed')),
    lower(coalesce(p_objective, 'brand_awareness')),
    lower(coalesce(p_audience_type, 'recommended')),
    greatest(13, least(coalesce(p_minimum_age, 13), 120)),
    case when p_maximum_age is null then null else greatest(coalesce(p_minimum_age, 13), least(p_maximum_age, 120)) end,
    lower(coalesce(p_gender_target, 'all')),
    coalesce(p_interest_categories, '{}'::text[]), nullif(btrim(coalesce(p_target_area, '')), ''),
    greatest(1, least(coalesce(p_duration_days, 14), 365)), v_start, v_end,
    lower(coalesce(p_budget_type, 'total')), greatest(0, coalesce(p_budget_amount, 0)),
    v_currency,
    case when v_post_safe then 'active' else 'pending_review' end,
    case when v_post_safe then 'approved' else 'pending' end,
    timezone('utc', now())
  )
  on conflict (creative_post_id) do update set
    placement = excluded.placement,
    objective = excluded.objective,
    audience_type = excluded.audience_type,
    minimum_age = excluded.minimum_age,
    maximum_age = excluded.maximum_age,
    gender_target = excluded.gender_target,
    interest_categories = excluded.interest_categories,
    target_area = excluded.target_area,
    duration_days = excluded.duration_days,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    budget_type = excluded.budget_type,
    budget_amount = excluded.budget_amount,
    currency = excluded.currency,
    status = excluded.status,
    moderation_status = excluded.moderation_status,
    updated_at = timezone('utc', now())
  returning * into v_campaign;

  update public.explore_posts
  set post_privacy = 'public', post_type = 'advert', category = 'advert'
  where id = v_post.id;

  return v_campaign;
end;
$$;

grant execute on function public.create_explore_ad_campaign(uuid, text, text, text, integer, integer, text, text[], text, integer, timestamptz, timestamptz, text, numeric, text) to authenticated;

comment on function public.kunthai_get_client_country_config() is
  'Frontend bootstrap: every country with dial code, currency, market status, feature flags, and transport fleet capabilities in one payload.';
comment on function public.kunthai_fleet_type_allowed(text, text, text) is
  'Whether a fleet type may operate for a purpose (ride/delivery/any) in a country, per kunthai_countries capability arrays.';
