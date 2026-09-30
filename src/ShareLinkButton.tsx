import { Button, type MantineSize, TextInput } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { webPageLink } from './shared/spreadsheet'

export interface ShareLinkButtonProps {
  /** where the web page is */
  pageUrl: string
  spreadsheetId: string
  size?: MantineSize
}

/**
 * Copies a link to the web page that opens this sheet, to send to people
 * without the extension. If the browser won't copy, shows the link instead.
 */
export function ShareLinkButton({ pageUrl, spreadsheetId, size = 'xs' }: ShareLinkButtonProps) {
  const clipboard = useClipboard()
  const link = webPageLink(pageUrl, spreadsheetId)

  return (
    <>
      <Button
        size={size}
        variant="default"
        title="Copy a link to the web page that opens this sheet"
        onClick={() => {
          clipboard.copy(link)
        }}
      >
        {clipboard.copied ? 'Link copied' : 'Copy link'}
      </Button>
      {clipboard.error && (
        <TextInput
          w="100%"
          size={size}
          readOnly
          label="Copy this link"
          value={link}
          onFocus={(event) => {
            event.currentTarget.select()
          }}
        />
      )}
    </>
  )
}
