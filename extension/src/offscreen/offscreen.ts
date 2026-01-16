/**
 * Offscreen document script for clipboard access
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Return true to indicate we will send a response asynchronously
  if (message.target === 'offscreen-doc' && message.type === 'copy-to-clipboard') {
    handleClipboardWrite(message.data)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true;
  }
});

async function handleClipboardWrite(data) {
  try {
    if (typeof data !== 'string') {
      throw new TypeError(`Value must be a string, got ${typeof data}`);
    }

    const textArea = document.querySelector('#text-copy');
    if (!textArea) {
      throw new Error('Text area not found');
    }
    
    // Ensure textArea is an HTMLTextAreaElement
    if (textArea instanceof HTMLTextAreaElement) {
        textArea.value = data;
        textArea.select();
        document.execCommand('copy');
    } else {
        throw new Error('Element is not a text area');
    }
  } catch (error) {
    console.error('Offscreen clipboard write failed', error);
    throw error;
  }
}
