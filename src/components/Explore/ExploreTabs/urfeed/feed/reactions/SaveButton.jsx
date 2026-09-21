
import { t as i18nText } from "../../../../../../i18n/index";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";export default function SaveButton() {
  useUiLocale();
  return <button>{i18nText("ui.literals.kfcc1de4daab5")}</button>;
}
