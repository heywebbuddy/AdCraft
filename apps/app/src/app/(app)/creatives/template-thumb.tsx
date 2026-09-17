import type { StaticTemplate } from "@adcraft/render";
import styles from "./template-thumb.module.css";

/** Illustrative finished layouts, not a preview of the customer's generated output. */
export function TemplateThumb({ template, className = "" }: {
  template: StaticTemplate;
  colors: { primary: string; accent: string };
  className?: string;
}) {
  return <span aria-hidden="true" className={`${styles.frame} ${styles[template]} ${className}`}>
    <span className={styles.photo} />
    <span className={styles.shade} />
    <span className={styles.brand}>éclat<span>SKIN, SIMPLIFIED.</span></span>
    <span className={styles.copy}>
      {template === "hero" ? <>Your daily<br /><em>dose of glow.</em></> : template === "split" ? <>Small ritual.<br /><em>Beautiful days.</em></> : template === "minimal" ? <>Less, but<br /><em>better.</em></> : <>GOOD<br />SKIN<br /><em>DAYS.</em></>}
    </span>
    <span className={styles.note}>{template === "minimal" ? "THE EVERYDAY SERUM" : template === "bold" ? "A LITTLE DAILY BRILLIANCE." : "Meet your new everyday essential."}</span>
    <span className={styles.cta}>Discover the serum <span>↗</span></span>
    {template === "bold" && <span className={styles.seal}>YOUR<br />DAILY<br />RITUAL</span>}
  </span>;
}
