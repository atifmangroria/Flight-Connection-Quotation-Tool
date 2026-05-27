(function () {
 const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{21A9}\u{2190}-\u{21FF}]/gu;

 function cleanButtonText(button) {
 if (!button || button.classList.contains('modal-close')) return;
 Array.from(button.childNodes).forEach((node) => {
 if (node.nodeType !== Node.TEXT_NODE) return;
 const cleaned = node.textContent
 .replace(emojiPattern, '')
 .replace(/\s+/g, ' ')
 .trim();
 if (cleaned !== node.textContent.trim()) {
 node.textContent = cleaned ? ` ${cleaned} ` : '';
 }
 });
 }

 function cleanButtons(root = document) {
 root.querySelectorAll('button, .btn').forEach(cleanButtonText);
 }

 function makeBottomAddButton(originalButton) {
 const panel = originalButton.closest('.service-panel');
 if (!panel || panel.querySelector(`[data-fc-bottom-for="${originalButton.id}"]`)) return;

 const wrap = panel.querySelector('.fc-bottom-actions') || document.createElement('div');
 wrap.className = 'fc-bottom-actions no-print';

 const mirror = document.createElement('button');
 mirror.type = 'button';
 mirror.className = originalButton.className || 'add-btn';
 mirror.dataset.fcBottomFor = originalButton.id;
 mirror.textContent = originalButton.textContent.replace(emojiPattern, '').replace(/\s+/g, ' ').trim();
 mirror.addEventListener('click', () => originalButton.click());

 wrap.appendChild(mirror);
 panel.appendChild(wrap);
 }

 function setupBottomAddButtons() {
 [
 'btnAddFlight',
 'btnAddHotel',
 'btnAddHotelM',
 'btnAddHotelA',
 'btnAddTrans',
 'btnAddTour',
 'btnAddVisa'
 ].forEach((id) => {
 const button = document.getElementById(id);
 if (button) makeBottomAddButton(button);
 });
 }

 function syncVisaAddState() {
 const visaExists = !!document.getElementById('visaBlock');
 document.querySelectorAll('#btnAddVisa, [data-fc-bottom-for="btnAddVisa"]').forEach((button) => {
 if (button.disabled !== visaExists) button.disabled = visaExists;
 button.classList.toggle('fc-disabled', visaExists);
 const nextText = visaExists ? 'Visa Added' : 'Add Visa';
 if (button.textContent.trim() !== nextText) button.textContent = nextText;
 const nextTitle = visaExists ? 'One visa section is already added for this quotation.' : '';
 if (button.title !== nextTitle) button.title = nextTitle;
 });
 }

 function init() {
 cleanButtons();
 setupBottomAddButtons();
 syncVisaAddState();

 const observer = new MutationObserver((mutations) => {
 mutations.forEach((mutation) => {
 mutation.addedNodes.forEach((node) => {
 if (node.nodeType !== Node.ELEMENT_NODE) return;
 if (node.matches && (node.matches('button') || node.matches('.btn'))) cleanButtonText(node);
 if (node.querySelectorAll) cleanButtons(node);
 });
 if (mutation.type === 'characterData') {
 const parent = mutation.target.parentElement;
 if (parent && (parent.matches('button') || parent.matches('.btn'))) cleanButtonText(parent);
 }
 });
 syncVisaAddState();
 });

 observer.observe(document.body, { childList: true, characterData: true, subtree: true });
 }

 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', init);
 } else {
 init();
 }
})();
