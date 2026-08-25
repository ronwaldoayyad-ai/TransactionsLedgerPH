import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import { buildInvoiceHtml } from './invoiceHtml'

// Generate the invoice PDF from HTML (native print engine) and hand it to the
// OS share sheet (Save to Files, AirDrop, Mail, etc.) — the mobile "download".
export async function shareInvoicePdf(invoice: any) {
  const { uri } = await Print.printToFileAsync({ html: buildInvoiceHtml(invoice) })
  let target = uri
  try {
    const dest = `${FileSystem.cacheDirectory}${invoice.invoiceNumber || 'invoice'}.pdf`
    await FileSystem.copyAsync({ from: uri, to: dest })
    target = dest
  } catch {
    /* fall back to the raw print URI */
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `Invoice ${invoice.invoiceNumber ?? ''}`.trim(),
    })
  }
}
