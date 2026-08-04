const form = document.querySelector('#ask-form');
const question = document.querySelector('#question');
const scope = document.querySelector('#scope');
const result = document.querySelector('#result');
const loading = document.querySelector('#loading');
const answer = document.querySelector('#answer');
const errorBox = document.querySelector('#error');
const sources = document.querySelector('#sources');
const trace = document.querySelector('#trace');
const provider = document.querySelector('#provider');
const submit = document.querySelector('#submit');

document.querySelectorAll('[data-question]').forEach((button) => {
  button.addEventListener('click', () => {
    question.value = button.dataset.question;
    question.focus();
  });
});

const escapeHtml = (value = '') => value.replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function renderSources(items) {
  const unique = [...new Map(items.map((item) => [item.document_id, item])).values()];
  if (!unique.length) { sources.innerHTML = ''; return; }
  sources.innerHTML = `<h3>官方資料來源</h3>${unique.map((item) => `
    <div class="source">
      <span class="source-num">${item.citation_id}</span>
      <div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || item.text.slice(0, 120))}</p><span class="state">${escapeHtml((item.states || []).join(' · ') || '狀態未標示')} ${item.published_at ? `· ${escapeHtml(item.published_at)}` : ''}</span></div>
      <a href="${encodeURI(item.url)}" target="_blank" rel="noopener">核對原文 ↗</a>
    </div>`).join('')}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  result.classList.remove('hidden'); loading.classList.remove('hidden');
  answer.textContent = ''; sources.innerHTML = ''; errorBox.classList.add('hidden'); trace.classList.add('hidden'); provider.textContent = '';
  submit.disabled = true; result.scrollIntoView({behavior:'smooth', block:'start'});
  try {
    const response = await fetch('/api/ask', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question:question.value, scope:scope.value})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '檢索失敗，請稍後再試。');
    answer.textContent = data.answer;
    provider.textContent = data.provider === 'extractive' ? '無模型 · 檢索模式' : data.provider;
    const meta = data.meta || {};
    trace.textContent = `官方檢索詞「${meta.official_query || question.value}」· 搜法易找到 ${meta.official_hits ?? 0} 項結果 · 本地重排 ${data.sources.length} 個段落 · 涉及 ${meta.retrieved_documents ?? 0} 份文件`;
    trace.classList.remove('hidden'); renderSources(data.sources || []);
  } catch (error) {
    errorBox.textContent = error.message; errorBox.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden'); submit.disabled = false;
  }
});
