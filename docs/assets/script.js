/**
 * TrendRadar 配置文件编辑器核心逻辑
 * 特点：确保原始 YAML 的注释和格式 100% 保留
 */

// ==========================================
// 0. 注释高亮功能
// ==========================================

/**
 * 对文本应用高亮，# 后的内容显示为灰色
 */
function applyHighlight(text) {
    const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return text.split('\n').map(line => {
        const idx = line.indexOf('#');
        if (idx === -1) return escape(line);
        return escape(line.slice(0, idx)) + '<span class="syntax-comment">' + escape(line.slice(idx)) + '</span>';
    }).join('\n');
}

/**
 * 更新高亮层
 */
function updateBackdrop(textareaId, backdropId) {
    const ta = document.getElementById(textareaId);
    const bd = document.getElementById(backdropId);
    if (ta && bd) bd.innerHTML = applyHighlight(ta.value) + '\n';
}

/**
 * 同步滚动
 */
function syncScroll(textareaId, backdropId) {
    const ta = document.getElementById(textareaId);
    const bd = document.getElementById(backdropId);
    if (ta && bd) {
        bd.scrollTop = ta.scrollTop;
        bd.scrollLeft = ta.scrollLeft;
    }
}

// ==========================================
// 12. 支持项目弹窗逻辑
// ==========================================

/**
 * 打开支持弹窗
 */
function openSupportModal() {
    const modal = document.getElementById('support-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // 禁止背景滚动
    }
}

/**
 * 关闭支持弹窗
 */
function closeSupportModal() {
    const modal = document.getElementById('support-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = ''; // 恢复滚动
    }
}

/**
 * 点击外部关闭
 */
function closeSupportModalOutside(event) {
    if (event.target.id === 'support-modal') {
        closeSupportModal();
    }
}

window.openSupportModal = openSupportModal;
window.closeSupportModal = closeSupportModal;
window.closeSupportModalOutside = closeSupportModalOutside;
const MODULE_DEFS = [
    { id: 1, name: "1. 基础设置", key: "app", editable: false },
    { id: 2, name: "2. 数据源 - 热榜平台", key: "platforms", editable: true },
    { id: 3, name: "3. 数据源 - RSS 订阅", key: "rss", editable: true },
    { id: 4, name: "4. 报告模式", key: "report", editable: true },
    { id: 5, name: "5. 推送内容控制", key: "display", editable: true },
    { id: 6, name: "6. 推送通知 (仅限时间窗口)", key: "notification", editable: true, partial: true },
    { id: 7, name: "7. 存储配置", key: "storage", editable: false },
    { id: 8, name: "8. AI 模型配置", key: "ai", editable: true },
    { id: 9, name: "9. AI 分析功能", key: "ai_analysis", editable: true },
    { id: 10, name: "10. AI 翻译功能", key: "ai_translation", editable: true },
    { id: 11, name: "11. 高级设置", key: "advanced", editable: false }
];

// 初始默认内容 (用于空状态) - 只显示提示文本
const INITIAL_YAML = `# 在此粘贴你的 config.yaml...
# 或拖拽文件到编辑器区域
# 或点击右上角"加载官网最新配置"`;

// LocalStorage 键名
const STORAGE_KEY_CONFIG = 'trendradar_config_yaml';
const STORAGE_KEY_FREQUENCY = 'trendradar_frequency_txt';
const STORAGE_KEY_CONFIG_TIME = 'trendradar_config_time';
const STORAGE_KEY_FREQUENCY_TIME = 'trendradar_frequency_time';

// 官网配置文件 URL
const REMOTE_CONFIG_URL = 'https://raw.githubusercontent.com/sansan0/TrendRadar/refs/heads/master/config/config.yaml';
const REMOTE_FREQUENCY_URL = 'https://raw.githubusercontent.com/sansan0/TrendRadar/refs/heads/master/config/frequency_words.txt';
const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/sansan0/TrendRadar/refs/heads/master/version_configs';

let currentYaml = "";
let currentFrequency = "";
let currentFrequencyData = null;  // 缓存解析后的数据，避免重复解析导致索引错位
let currentTab = "config";

// ==========================================
// 2. 初始化与事件绑定
// ==========================================
// 防抖定时器
let configSaveTimer = null;
let frequencySaveTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    const yamlEditor = document.getElementById('yaml-editor');
    const frequencyEditor = document.getElementById('frequency-editor');

    // 尝试从 LocalStorage 恢复配置
    const savedConfig = localStorage.getItem(STORAGE_KEY_CONFIG);
    const savedFrequency = localStorage.getItem(STORAGE_KEY_FREQUENCY);

    // 初始化编辑器
    if (savedConfig && savedConfig.trim() && savedConfig !== INITIAL_YAML) {
        yamlEditor.value = savedConfig;
        currentYaml = savedConfig;
        showToast('已恢复上次保存的配置', 'info');
    } else {
        yamlEditor.value = INITIAL_YAML;
        currentYaml = INITIAL_YAML;
    }

    if (savedFrequency && savedFrequency.trim()) {
        frequencyEditor.value = savedFrequency;
        currentFrequency = savedFrequency;
    } else {
        frequencyEditor.value = "# 在此粘贴你的 frequency_words.txt 内容...\n# 或拖拽文件到编辑器区域\n\n[GLOBAL_FILTER]\n\n[WORD_GROUPS]\n";
        currentFrequency = frequencyEditor.value;
    }

    // 渲染右侧模块列表
    renderModules();

    // 监听编辑器输入（实时同步到 UI + 防抖保存）
    yamlEditor.addEventListener('input', (e) => {
        currentYaml = e.target.value;
        updateBackdrop('yaml-editor', 'yaml-backdrop');
        syncYamlToUI();
        debounceSaveConfig();
    });

    frequencyEditor.addEventListener('input', (e) => {
        currentFrequency = e.target.value;
        updateBackdrop('frequency-editor', 'frequency-backdrop');
        currentFrequencyData = null;
        syncFrequencyToUI();
        debounceSaveFrequency();
    });

    // 同步滚动
    yamlEditor.addEventListener('scroll', () => syncScroll('yaml-editor', 'yaml-backdrop'));
    frequencyEditor.addEventListener('scroll', () => syncScroll('frequency-editor', 'frequency-backdrop'));

    // 初始化拖拽上传功能
    initDragAndDrop(yamlEditor, 'config');
    initDragAndDrop(frequencyEditor, 'frequency');

    // 页面关闭/刷新时立即保存
    window.addEventListener('beforeunload', saveAllToLocalStorage);

    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveAllToLocalStorage();
            showToast('已手动保存配置', 'success');
        }
    });

    syncYamlToUI();

    updateBackdrop('yaml-editor', 'yaml-backdrop');
    updateBackdrop('frequency-editor', 'frequency-backdrop');

    updateSaveTimeDisplay();
});

// 防抖保存 config.yaml
function debounceSaveConfig() {
    if (configSaveTimer) clearTimeout(configSaveTimer);
    configSaveTimer = setTimeout(() => {
        saveConfigToLocalStorage();
    }, 1000);
}

// 防抖保存 frequency_words.txt
function debounceSaveFrequency() {
    if (frequencySaveTimer) clearTimeout(frequencySaveTimer);
    frequencySaveTimer = setTimeout(() => {
        saveFrequencyToLocalStorage();
    }, 1000);
}

// ==========================================
// 2.1 拖拽上传功能
// ==========================================
function initDragAndDrop(editor, type) {
    const container = editor.parentElement;

    const dropOverlay = document.createElement('div');
    dropOverlay.className = 'drop-overlay hidden';
    dropOverlay.innerHTML = `
        <div class="drop-overlay-content">
            <i class="fa-solid fa-cloud-arrow-up text-4xl mb-2"></i>
            <div class="text-sm font-bold">释放以加载文件</div>
            <div class="text-xs opacity-75">${type === 'config' ? 'config.yaml' : 'frequency_words.txt'}</div>
        </div>
    `;
    container.style.position = 'relative';
    container.appendChild(dropOverlay);

    editor.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropOverlay.classList.remove('hidden');
    });

    editor.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!container.contains(e.relatedTarget)) {
            dropOverlay.classList.add('hidden');
        }
    });

    dropOverlay.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!container.contains(e.relatedTarget)) {
            dropOverlay.classList.add('hidden');
        }
    });

    dropOverlay.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    dropOverlay.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropOverlay.classList.add('hidden');
        handleFileDrop(e, type);
    });

    editor.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropOverlay.classList.add('hidden');
        handleFileDrop(e, type);
    });
}

function handleFileDrop(e, type) {
    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];

    const validExtensions = type === 'config'
        ? ['.yaml', '.yml', '.txt']
        : ['.txt', '.yaml', '.yml'];

    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValid) {
        showToast(`请拖入 ${type === 'config' ? 'YAML' : 'TXT'} 文件`, 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const content = event.target.result;

        if (type === 'config') {
            try {
                jsyaml.load(content);
                document.getElementById('yaml-editor').value = content;
                currentYaml = content;
                syncYamlToUI();
                showToast(`已加载: ${file.name}`, 'success');
            } catch (err) {
                showToast(`YAML 语法错误: ${err.message}`, 'error');
                // 仍然加载，让用户修复
                document.getElementById('yaml-editor').value = content;
                currentYaml = content;
            }
        } else {
            document.getElementById('frequency-editor').value = content;
            currentFrequency = content;
            syncFrequencyToUI();
            showToast(`已加载: ${file.name}`, 'success');
        }
    };

    reader.onerror = () => {
        showToast('文件读取失败', 'error');
    };

    reader.readAsText(file);
}

// ==========================================
// 2.2 LocalStorage 保存与恢复
// ==========================================

// 保存 config.yaml
function saveConfigToLocalStorage() {
    try {
        if (currentYaml && currentYaml.trim().length > 10) {
            const now = new Date().toISOString();
            localStorage.setItem(STORAGE_KEY_CONFIG, currentYaml);
            localStorage.setItem(STORAGE_KEY_CONFIG_TIME, now);
            updateSaveTimeDisplay();
        }
    } catch (e) {
        console.warn('LocalStorage 保存 config 失败:', e);
    }
}

// 保存 frequency_words.txt
function saveFrequencyToLocalStorage() {
    try {
        if (currentFrequency && currentFrequency.trim().length > 10) {
            const now = new Date().toISOString();
            localStorage.setItem(STORAGE_KEY_FREQUENCY, currentFrequency);
            localStorage.setItem(STORAGE_KEY_FREQUENCY_TIME, now);
            updateSaveTimeDisplay();
        }
    } catch (e) {
        console.warn('LocalStorage 保存 frequency 失败:', e);
    }
}

// 保存全部（页面关闭时调用）
function saveAllToLocalStorage() {
    saveConfigToLocalStorage();
    saveFrequencyToLocalStorage();
}

// 兼容旧调用
function saveToLocalStorage() {
    saveAllToLocalStorage();
}

// 格式化时间显示
function formatSaveTime(isoString) {
    if (!isoString) return '未保存';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;

    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 更新保存时间显示
function updateSaveTimeDisplay() {
    const configTime = localStorage.getItem(STORAGE_KEY_CONFIG_TIME);
    const frequencyTime = localStorage.getItem(STORAGE_KEY_FREQUENCY_TIME);

    // 更新 config.yaml 的时间显示
    const configTimeEl = document.getElementById('config-save-time');
    const configLabelEl = document.getElementById('config-save-label');
    if (configTimeEl) {
        configTimeEl.textContent = formatSaveTime(configTime);
        configTimeEl.title = configTime ? new Date(configTime).toLocaleString('zh-CN') : '未保存';
        if (configLabelEl) {
            if (configTime) {
                configLabelEl.classList.remove('hidden');
            } else {
                configLabelEl.classList.add('hidden');
            }
        }
    }

    // 更新 frequency_words.txt 的时间显示
    const frequencyTimeEl = document.getElementById('frequency-save-time');
    const frequencyLabelEl = document.getElementById('frequency-save-label');
    if (frequencyTimeEl) {
        frequencyTimeEl.textContent = formatSaveTime(frequencyTime);
        frequencyTimeEl.title = frequencyTime ? new Date(frequencyTime).toLocaleString('zh-CN') : '未保存';
        if (frequencyLabelEl) {
            if (frequencyTime) {
                frequencyLabelEl.classList.remove('hidden');
            } else {
                frequencyLabelEl.classList.add('hidden');
            }
        }
    }
}

// ==========================================
// 2.3 加载官网最新配置
// ==========================================
window.openLoadConfigModal = function() {
    // 创建选择弹窗
    const modal = document.createElement('div');
    modal.id = 'load-config-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 420px;">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold text-gray-800"><i class="fa-solid fa-cloud-arrow-down mr-2 text-blue-500"></i>加载官网最新配置</h3>
                <button onclick="closeLoadConfigModal()" class="text-gray-400 hover:text-gray-600"><i class="fa-solid fa-times text-xl"></i></button>
            </div>
            <div class="text-sm text-gray-600 mb-4">
                选择要从 GitHub 加载的配置文件：
            </div>
            <div class="space-y-3">
                <label class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors">
                    <input type="checkbox" id="load-config-yaml" checked class="w-4 h-4 text-blue-600 rounded">
                    <div class="flex-1">
                        <div class="font-medium text-gray-800">config.yaml</div>
                        <div class="text-xs text-gray-500">系统配置、平台、AI、通知等</div>
                    </div>
                    <i class="fa-solid fa-file-code text-blue-400"></i>
                </label>
                <label class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors">
                    <input type="checkbox" id="load-frequency-txt" checked class="w-4 h-4 text-blue-600 rounded">
                    <div class="flex-1">
                        <div class="font-medium text-gray-800">frequency_words.txt</div>
                        <div class="text-xs text-gray-500">关键词组、过滤规则、正则逻辑</div>
                    </div>
                    <i class="fa-solid fa-filter text-orange-400"></i>
                </label>
            </div>
            <div class="text-xs text-gray-400 mt-3 p-2 bg-gray-50 rounded">
                <i class="fa-solid fa-info-circle mr-1"></i>
                数据来源：<a href="https://github.com/sansan0/TrendRadar" target="_blank" class="text-blue-500 hover:underline">sansan0/TrendRadar</a>
            </div>
            <div class="flex justify-end gap-2 mt-4">
                <button onclick="closeLoadConfigModal()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
                <button onclick="confirmLoadConfig()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <i class="fa-solid fa-download mr-1"></i>加载选中
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.closeLoadConfigModal = function() {
    const modal = document.getElementById('load-config-modal');
    if (modal) modal.remove();
}

window.confirmLoadConfig = async function() {
    const loadConfig = document.getElementById('load-config-yaml')?.checked;
    const loadFrequency = document.getElementById('load-frequency-txt')?.checked;

    if (!loadConfig && !loadFrequency) {
        showToast('请至少选择一个文件', 'warning');
        return;
    }

    closeLoadConfigModal();
    showToast('正在从 GitHub 加载...', 'info');

    try {
        const promises = [];
        if (loadConfig) promises.push(fetch(REMOTE_CONFIG_URL).then(r => ({ type: 'config', res: r })));
        if (loadFrequency) promises.push(fetch(REMOTE_FREQUENCY_URL).then(r => ({ type: 'frequency', res: r })));

        const results = await Promise.all(promises);

        for (const { type, res } of results) {
            if (!res.ok) {
                throw new Error(`${type === 'config' ? 'config.yaml' : 'frequency_words.txt'} 加载失败: ${res.status}`);
            }

            const text = await res.text();

            if (type === 'config') {
                // 验证 YAML 语法
                try {
                    jsyaml.load(text);
                } catch (yamlErr) {
                    showToast(`YAML 语法错误: ${yamlErr.message}`, 'error');
                    continue;
                }
                document.getElementById('yaml-editor').value = text;
                currentYaml = text;
                updateBackdrop('yaml-editor', 'yaml-backdrop');
                syncYamlToUI();
            } else {
                document.getElementById('frequency-editor').value = text;
                currentFrequency = text;
                currentFrequencyData = null;
                updateBackdrop('frequency-editor', 'frequency-backdrop');
                syncFrequencyToUI();
            }
        }

        saveToLocalStorage();

        const loadedFiles = [];
        if (loadConfig) loadedFiles.push('config.yaml');
        if (loadFrequency) loadedFiles.push('frequency_words.txt');
        showToast(`已加载: ${loadedFiles.join(', ')}`, 'success');

    } catch (err) {
        console.error('加载远程配置失败:', err);
        showToast(`加载失败: ${err.message}`, 'error');
    }
}

// ==========================================
// 2.4 Toast 提示
// ==========================================
function showToast(message, type = 'info') {
    // 移除已有的 toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };

    toast.innerHTML = `
        <i class="fa-solid ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // 动画入场
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // 自动消失
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// 3. 渲染逻辑
// ==========================================
function renderModules() {
    const container = document.getElementById('config-panel');
    container.innerHTML = '';

    renderModuleNav();

    MODULE_DEFS.forEach(mod => {
        const card = document.createElement('div');
        card.className = `module-card ${mod.editable ? 'active' : 'disabled'}`;
        card.id = `module-${mod.key}`;

        const header = `
            <div class="module-header px-4 py-3 flex items-center justify-between cursor-pointer" onclick="scrollToModuleInEditor('${mod.key}')">
                <div class="flex items-center">
                    <span class="text-sm font-bold">${mod.name}</span>
                    <i class="fa-solid fa-arrow-up-right-from-square text-blue-400 text-[10px] ml-2 opacity-0 group-hover:opacity-100" title="跳转到左侧编辑器"></i>
                </div>
                ${!mod.editable ?
                    '<span class="locked-badge text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded">只读 (请在左侧编辑)</span>' :
                    '<i class="fa-solid fa-chevron-down text-gray-400 text-xs"></i>'}
            </div>
        `;

        const body = mod.editable ? `<div class="module-body p-5 border-t border-gray-50 space-y-4" id="controls-${mod.key}"></div>` : '';

        card.innerHTML = header + body;
        container.appendChild(card);

        if (mod.editable) {
            renderControls(mod);
        }
    });
}

// 渲染模块导航栏
function renderModuleNav() {
    const nav = document.getElementById('module-nav');
    if (!nav) return;

    nav.innerHTML = MODULE_DEFS.map(mod => `
        <button onclick="scrollToModuleInEditor('${mod.key}')"
                class="module-nav-btn text-[10px] px-2 py-1 rounded ${mod.editable ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} transition-colors"
                title="跳转到模块 ${mod.id}">
            ${mod.id}
        </button>
    `).join('');
}

// 切换组名编辑状态
window.toggleGroupNameEdit = function(btn) {
    const container = btn.parentNode;
    const span = container.querySelector('span.text-sm');
    const input = container.querySelector('input[type="text"]');

    if (input.classList.contains('hidden')) {
        // 进入编辑模式
        span.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
        btn.innerHTML = '<i class="fa-solid fa-check text-green-600"></i>';
    } else {
        // 退出编辑模式
        span.classList.remove('hidden');
        input.classList.add('hidden');
        btn.innerHTML = '<i class="fa-solid fa-pen"></i>';

        // 如果内容变化，已经通过 onchange 触发更新
        span.textContent = input.value;
    }
}

// 跳转到左侧编辑器中对应词组的位置
window.scrollToWordGroupInEditor = function(groupIndex) {
    const editor = document.getElementById('frequency-editor');
    // 重新解析以确保行号准确
    const data = parseFrequencyText(editor.value);

    if (!data.wordGroups[groupIndex]) return;

    const targetLineIndex = data.wordGroups[groupIndex].startLine;
    if (targetLineIndex === undefined || targetLineIndex === -1) return;

    const lines = editor.value.split('\n');
    const lineHeight = 19.5;
    const scrollPosition = targetLineIndex * lineHeight;

    // 设置光标选区
    let charCount = 0;
    for (let i = 0; i < targetLineIndex; i++) {
        charCount += lines[i].length + 1; // +1 for newline
    }

    editor.focus();
    editor.setSelectionRange(charCount, charCount + lines[targetLineIndex].length);
    editor.scrollTop = scrollPosition - 50;

    // 高亮效果
    editor.style.transition = 'background-color 0.3s';
    const originalBg = editor.style.backgroundColor;
    editor.style.backgroundColor = '#2d4a7c';
    setTimeout(() => {
        editor.style.backgroundColor = originalBg;
    }, 300);
}

// 跳转到左侧编辑器中对应模块的位置
window.scrollToModuleInEditor = function(modKey) {
    const editor = document.getElementById('yaml-editor');
    const yaml = editor.value;
    const lines = yaml.split('\n');

    // 查找模块标题注释行（# N. 模块名）
    let targetLineIndex = -1;
    const mod = MODULE_DEFS.find(m => m.key === modKey);
    if (!mod) return;

    // 直接匹配包含模块编号的标题行，如：# 5. 推送内容控制
    const moduleTitlePattern = new RegExp(`^#\\s*${mod.id}\\.\\s+`, 'i');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 匹配模块标题行（包含编号的注释行）
        if (moduleTitlePattern.test(line)) {
            targetLineIndex = i;
            break;
        }
    }

    // 如果没找到标题行，尝试查找模块键名（如 platforms:）
    if (targetLineIndex === -1) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(new RegExp(`^${modKey}:\\s*`))) {
                targetLineIndex = i;
                break;
            }
        }
    }

    if (targetLineIndex === -1) return;

    // 计算目标位置并滚动
    const lineHeight = 19.5;
    const scrollPosition = targetLineIndex * lineHeight;

    // 设置光标位置
    const textBeforeTarget = lines.slice(0, targetLineIndex).join('\n').length + (targetLineIndex > 0 ? 1 : 0);
    editor.focus();
    editor.setSelectionRange(textBeforeTarget, textBeforeTarget + lines[targetLineIndex].length);

    editor.scrollTop = scrollPosition - 5;

    // 高亮提示（闪烁效果）
    editor.style.transition = 'background-color 0.3s';
    const originalBg = editor.style.backgroundColor;
    editor.style.backgroundColor = '#2d4a7c';
    setTimeout(() => {
        editor.style.backgroundColor = originalBg;
    }, 300);
}

function renderControls(mod) {
    const body = document.getElementById(`controls-${mod.key}`);

    // 根据模块 key 定义不同的 UI 控件
    let html = "";

    switch(mod.key) {
        case "platforms":
            html = createToggleControl(mod.key, "enabled", "启用热榜抓取");
            html += `<div class="mt-4 mb-2 text-xs font-bold text-gray-700">平台列表 <span class="text-gray-400 font-normal">(可拖拽排序)</span></div>`;
            html += `<div id="platforms-list" class="space-y-2"></div>`;
            html += `<div class="flex items-center gap-2 mt-3">
                        <button onclick="openPlatformModal()" class="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition-colors">
                            <i class="fa-solid fa-plus mr-1"></i>添加平台
                        </button>
                        <a href="https://github.com/sansan0/TrendRadar?tab=readme-ov-file#%E9%85%8D%E7%BD%AE%E8%AF%A6%E8%A7%A3" target="_blank" class="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors border border-gray-200 flex items-center gap-1 no-underline">
                            <i class="fa-solid fa-circle-question text-gray-400"></i>添加其它平台
                        </a>
                     </div>`;
            break;
        case "rss":
            html = createToggleControl(mod.key, "enabled", "启用 RSS 抓取");
            html += `<div class="mt-3 mb-2 text-xs font-bold text-gray-700">新鲜度过滤</div>`;
            html += createToggleControl(mod.key, "freshness_filter.enabled", "启用新鲜度过滤");
            html += createNumberControl(mod.key, "freshness_filter.max_age_days", "最大文章年龄 (天)");
            html += `<div class="mt-4 mb-2 text-xs font-bold text-gray-700">RSS 源列表</div>`;
            html += `<div id="rss-feeds-list" class="space-y-2"></div>`;
            html += `<div class="flex items-center gap-2 mt-3">
                        <button onclick="openRssModal()" class="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition-colors">
                            <i class="fa-solid fa-plus mr-1"></i>添加 RSS 源
                        </button>
                        <div class="text-xs text-gray-500 italic">
                            (内附 RSS 源参考库)
                        </div>
                     </div>`;
            html += `<div class="text-xs text-orange-600 mt-2 p-2 bg-orange-50 rounded border border-orange-200">
                        <i class="fa-solid fa-triangle-exclamation mr-1"></i>
                        <strong>注意：</strong>部分海外媒体内容可能涉及敏感话题，AI 模型可能拒绝翻译或分析，建议根据实际需求筛选订阅源。
                     </div>`;
            break;
        case "report":
            html = createSelectControl(mod.key, "mode", "报告模式", ["current", "daily", "incremental"]);
            html += createSelectControl(mod.key, "display_mode", "分组维度", ["keyword", "platform"]);
            html += createToggleControl(mod.key, "sort_by_position_first", "按定义顺序排序");
            html += createNumberControl(mod.key, "rank_threshold", "排名高亮阈值");
            html += createNumberControl(mod.key, "max_news_per_keyword", "每个关键词最大显示数量");
            break;
        case "display":
            html = `<div class="text-xs font-bold text-gray-700 mb-2">推送内容控制 <span class="text-gray-400 font-normal">(可拖拽排序)</span></div>`;
            html += `<div id="display-regions-list" class="space-y-2"></div>`;
            html += `<div class="text-xs text-gray-500 mt-2 mb-6">
                        <i class="fa-solid fa-lightbulb mr-1"></i>
                        提示：列表顺序决定了报告中的显示顺序
                     </div>`;

            // Standalone Configuration Section
            html += `<div class="border-t border-gray-200 pt-4 mt-4">`;
            html += `<div class="text-xs font-bold text-gray-700 mb-3">独立展示区配置 <span class="text-gray-400 font-normal">(仅在上方开启"独立展示区"时生效)</span></div>`;

            html += createNumberControl(mod.key, "standalone.max_items", "每个源最多展示条数");

            html += `<div class="mt-3 mb-2 text-xs font-medium text-gray-700">选择要展示的热榜平台</div>`;
            html += `<div id="standalone-platforms-list" class="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50 grid grid-cols-2 gap-2"></div>`;

            html += `<div class="mt-3 mb-2 text-xs font-medium text-gray-700">选择要展示的 RSS 源</div>`;
            html += `<div id="standalone-rss-list" class="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50 grid grid-cols-1 gap-2"></div>`;

            html += `</div>`;

            setTimeout(() => {
                renderDisplayRegionsList();
                renderStandaloneLists();
            }, 0);
            break;
        case "notification":
            // 只有推送窗口可见
            html = `<div class="text-xs font-bold text-blue-600 mb-2">推送时间窗口设置</div>`;
            html += createToggleControl(mod.key, "push_window.enabled", "开启时间窗口");
            html += `<div class="grid grid-cols-2 gap-4">
                        ${createInputControl(mod.key, "push_window.start", "开始时间 (HH:MM)")}
                        ${createInputControl(mod.key, "push_window.end", "结束时间 (HH:MM)")}
                    </div>`;
            html += createToggleControl(mod.key, "push_window.once_per_day", "窗口内仅推送一次");
            html += `<div class="text-xs text-gray-500 mt-2">通知渠道配置请在左侧编辑器中修改</div>`;
            break;
        case "ai":
            html = createInputControl(mod.key, "model", "模型名称");
            html += createInputControl(mod.key, "api_key", "API Key", "password");
            html += createInputControl(mod.key, "api_base", "API Base URL (可选)");
            html += createNumberControl(mod.key, "timeout", "请求超时 (秒)");
            html += createNumberControl(mod.key, "temperature", "采样温度 (0.0-2.0)");
            html += createNumberControl(mod.key, "max_tokens", "最大生成 Token 数");
            break;
        case "ai_analysis":
            html = createToggleControl(mod.key, "enabled", "开启 AI 分析报告");

            // AI 分析时间窗口设置
            html += `<div class="text-xs font-bold text-blue-600 mb-2 mt-4">AI 分析时间窗口设置</div>`;
            html += createToggleControl(mod.key, "analysis_window.enabled", "开启时间窗口");
            html += `<div class="grid grid-cols-2 gap-4">
                        ${createInputControl(mod.key, "analysis_window.start", "开始时间 (HH:MM)")}
                        ${createInputControl(mod.key, "analysis_window.end", "结束时间 (HH:MM)")}
                    </div>`;
            html += createToggleControl(mod.key, "analysis_window.once_per_day", "窗口内仅分析一次");

            // 其他 AI 分析配置
            html += `<div class="text-xs font-bold text-blue-600 mb-2 mt-4">分析内容配置</div>`;
            html += createInputControl(mod.key, "language", "输出语言");
            html += createInputControl(mod.key, "prompt_file", "提示词配置文件");
            html += createSelectControl(mod.key, "mode", "AI 分析模式", ["follow_report", "daily", "current", "incremental"]);
            html += createNumberControl(mod.key, "max_news_for_analysis", "最大分析条数");
            html += createToggleControl(mod.key, "include_rss", "包含 RSS 内容");
            html += createToggleControl(mod.key, "include_rank_timeline", "传递完整排名时间线");
            break;
        case "ai_translation":
            html = createToggleControl(mod.key, "enabled", "开启 AI 自动翻译");
            html += createInputControl(mod.key, "language", "目标语言");
            html += createInputControl(mod.key, "prompt_file", "提示词配置文件");
            break;
    }

    body.innerHTML = html;

    // 绑定事件
    body.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('change', (e) => {
            updateYamlFromUI(mod.key, e.target.dataset.path, e.target);
        });
    });
}

// ==========================================
// 4. 同步逻辑 (YAML -> UI)
// ==========================================
function syncYamlToUI() {
    try {
        const doc = jsyaml.load(currentYaml);
        if (!doc) return;

        MODULE_DEFS.filter(m => m.editable).forEach(mod => {
            const modData = doc[mod.key];
            if (!modData) return;

            const controls = document.querySelectorAll(`#controls-${mod.key} [data-path]`);
            controls.forEach(ctrl => {
                const path = ctrl.dataset.path.split('.');
                let val = modData;
                for (const part of path) {
                    val = val ? val[part] : undefined;
                }

                if (ctrl.type === 'checkbox') {
                    ctrl.checked = !!val;
                } else {
                    ctrl.value = val !== undefined ? val : "";
                }
            });
        });

        renderPlatformsList();
        renderRssFeedsList();
        renderStandaloneLists(); 
    } catch (e) {
        // 解析失败时不更新 UI，保持原有状态
    }
}

// ==========================================
// 5. 更新逻辑 (UI -> YAML) - 核心难点：正则保留注释
// ==========================================
function updateYamlFromUI(modKey, path, el) {
    let newVal = el.type === 'checkbox' ? el.checked : el.value;

    // 如果是数字类型
    if (el.type === 'number') {
        newVal = parseFloat(newVal);
        if (isNaN(newVal)) newVal = 0;
    }

    const editor = document.getElementById('yaml-editor');
    let yaml = editor.value;
    const lines = yaml.split('\n');
    const pathParts = path.split('.');

    // 找到模块的起始行
    let moduleStartLine = -1;
    let moduleEndLine = lines.length;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 匹配模块开始（非缩进的 key:）
        const moduleMatch = line.match(/^([a-z_]+):/);
        if (moduleMatch) {
            if (moduleMatch[1] === modKey) {
                moduleStartLine = i;
            } else if (moduleStartLine >= 0) {
                // 找到下一个模块，记录当前模块结束位置
                moduleEndLine = i;
                break;
            }
        }
    }

    if (moduleStartLine < 0) return;

    // 在模块内查找目标路径
    let targetLine = -1;
    let currentIndent = 0;
    let searchKey = pathParts[pathParts.length - 1];

    for (let i = moduleStartLine + 1; i < moduleEndLine; i++) {
        const line = lines[i];
        if (line.trim() === '' || line.trim().startsWith('#')) continue;

        // 检查是否匹配目标键
        const indent = line.search(/\S/);
        const keyMatch = line.match(/^\s*([a-z_]+):\s*(.*)/i);

        if (keyMatch && keyMatch[1] === searchKey) {
            // 如果是嵌套路径，需要检查缩进层级是否正确
            if (pathParts.length > 1) {
                // 简化处理：对于嵌套路径，确保在正确的父级下
                let valid = true;
                for (let j = 0; j < pathParts.length - 1; j++) {
                    let found = false;
                    for (let k = moduleStartLine + 1; k < i; k++) {
                        const parentMatch = lines[k].match(/^\s*([a-z_]+):/i);
                        if (parentMatch && parentMatch[1] === pathParts[j]) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        valid = false;
                        break;
                    }
                }
                if (!valid) continue;
            }

            targetLine = i;
            break;
        }
    }

    if (targetLine < 0) return;

    // 更新该行，保留注释
    const originalLine = lines[targetLine];
    const match = originalLine.match(/^(\s*[a-z_]+:\s*)(.*)$/i);

    if (match) {
        const prefix = match[1];
        const rest = match[2];

        // 提取原有注释
        const commentMatch = rest.match(/(\s*#.*)$/);
        const comment = commentMatch ? commentMatch[1] : '';

        // 格式化新值
        let formattedVal = newVal;
        if (typeof newVal === 'string') {
            // 获取原值部分（去除注释后的部分）
            const valPart = rest.slice(0, rest.length - comment.length).trim();
            // 检查原值是否带有引号
            const isOriginalQuoted = (valPart.startsWith('"') && valPart.endsWith('"')) ||
                                     (valPart.startsWith("'") && valPart.endsWith("'"));

            // 如果原值有引号，或者新值包含特殊字符（空格、冒号、井号、引号）或者是空字符串，则添加双引号
            if (isOriginalQuoted || newVal.includes(':') || newVal.includes('#') ||
                newVal.includes('"') || newVal.includes(' ') || newVal === "") {
                formattedVal = `"${newVal.replace(/"/g, '\\"')}"`;
            }
        }

        // 构建新行
        lines[targetLine] = `${prefix}${formattedVal}${comment}`;
    }

    // 更新编辑器
    editor.value = lines.join('\n');
    currentYaml = editor.value;
    updateBackdrop('yaml-editor', 'yaml-backdrop');
    debounceSaveConfig();
}

// ==========================================
// 6. UI 组件工厂
// ==========================================
function createToggleControl(mod, path, label) {
    const id = `toggle-${mod}-${path.replace('.', '-')}`;
    return `
        <div class="flex items-center justify-between">
            <label for="${id}" class="text-xs font-medium text-gray-700">${label}</label>
            <div class="relative inline-block w-10 mr-2 align-middle select-none">
                <input type="checkbox" id="${id}" data-path="${path}" class="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-200 ease-in-out"/>
                <label for="${id}" class="toggle-label block overflow-hidden h-5 rounded-full bg-gray-300 cursor-pointer"></label>
            </div>
        </div>
    `;
}

function createInputControl(mod, path, label, type = "text") {
    return `
        <div>
            <label class="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">${label}</label>
            <input type="${type}" data-path="${path}" class="bg-white border-gray-300 focus:border-blue-500" placeholder="未设置">
        </div>
    `;
}

function createNumberControl(mod, path, label) {
    return `
        <div class="flex items-center justify-between">
            <label class="text-xs font-medium text-gray-700">${label}</label>
            <input type="number" data-path="${path}" class="w-20 text-right bg-white border-gray-300" style="width: 80px">
        </div>
    `;
}

function createSelectControl(mod, path, label, options) {
    const optionsHtml = options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
    return `
        <div>
            <label class="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">${label}</label>
            <select data-path="${path}" class="bg-white border-gray-300">
                ${optionsHtml}
            </select>
        </div>
    `;
}

// ==========================================
// 7. 工具函数
// ==========================================

window.copyResult = function() {
    const yamlEditor = document.getElementById('yaml-editor');
    const frequencyEditor = document.getElementById('frequency-editor');
    const editor = currentTab === 'config' ? yamlEditor : frequencyEditor;

    editor.select();
    document.execCommand('copy');

    const btn = document.querySelector('button[onclick="copyResult()"]');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check mr-1.5"></i>已复制!';
    setTimeout(() => btn.innerHTML = original, 2000);
}

window.resetToDefault = function() {
    if (confirm('确定要重置为初始状态吗？未保存的修改将丢失。')) {
        const yamlEditor = document.getElementById('yaml-editor');
        const frequencyEditor = document.getElementById('frequency-editor');

        if (currentTab === 'config') {
            yamlEditor.value = INITIAL_YAML;
            currentYaml = INITIAL_YAML;
            updateBackdrop('yaml-editor', 'yaml-backdrop');

            // 清除 LocalStorage 中的 config 数据
            localStorage.removeItem(STORAGE_KEY_CONFIG);
            localStorage.removeItem(STORAGE_KEY_CONFIG_TIME);

            // 重置 UI：重新渲染模块以清空输入框，因为 INITIAL_YAML 可能为空导致 syncYamlToUI 不执行更新
            renderModules();
            syncYamlToUI();
            updateSaveTimeDisplay();
        } else {
            frequencyEditor.value = "# 在此粘贴你的 frequency_words.txt 内容...\n\n[GLOBAL_FILTER]\n\n[WORD_GROUPS]\n";
            currentFrequency = frequencyEditor.value;
            updateBackdrop('frequency-editor', 'frequency-backdrop');

            // 清除 LocalStorage 中的 frequency 数据
            localStorage.removeItem(STORAGE_KEY_FREQUENCY);
            localStorage.removeItem(STORAGE_KEY_FREQUENCY_TIME);

            syncFrequencyToUI();
            updateSaveTimeDisplay();
        }
        showToast('已重置为初始状态', 'success');
    }
}

// ==========================================
// 8. Tab 切换功能
// ==========================================
window.switchTab = function(tab) {
    currentTab = tab;

    // 更新 Tab 按钮状态
    document.getElementById('tab-config').classList.toggle('active', tab === 'config');
    document.getElementById('tab-frequency').classList.toggle('active', tab === 'frequency');

    const configBtn = document.getElementById('tab-config');
    const freqBtn = document.getElementById('tab-frequency');

    if (tab === 'config') {
        configBtn.className = "tab-button active px-4 py-2 text-xs font-bold text-gray-300 hover:bg-[#2d2d30] transition-colors border-b-2 border-blue-500";
        freqBtn.className = "tab-button px-4 py-2 text-xs font-bold text-gray-500 hover:bg-[#2d2d30] transition-colors border-b-2 border-transparent";
    } else {
        configBtn.className = "tab-button px-4 py-2 text-xs font-bold text-gray-500 hover:bg-[#2d2d30] transition-colors border-b-2 border-transparent";
        freqBtn.className = "tab-button active px-4 py-2 text-xs font-bold text-gray-300 hover:bg-[#2d2d30] transition-colors border-b-2 border-blue-500";
    }

    // 更新编辑器显示
    document.getElementById('yaml-editor-wrap').classList.toggle('hidden', tab !== 'config');
    document.getElementById('frequency-editor-wrap').classList.toggle('hidden', tab !== 'frequency');

    // 更新右侧面板
    document.getElementById('config-panel').classList.toggle('hidden', tab !== 'config');
    document.getElementById('frequency-panel').classList.toggle('hidden', tab !== 'frequency');

    // 更新模块导航栏显示状态：只在 config 模式下显示
    const moduleNav = document.getElementById('module-nav');
    if (moduleNav) {
        moduleNav.classList.toggle('hidden', tab !== 'config');
    }

    // 更新保存时间显示
    const saveTimeConfig = document.getElementById('save-time-config');
    const saveTimeFrequency = document.getElementById('save-time-frequency');
    if (saveTimeConfig) saveTimeConfig.classList.toggle('hidden', tab !== 'config');
    if (saveTimeFrequency) saveTimeFrequency.classList.toggle('hidden', tab !== 'frequency');

    // 更新右侧标题
    const versionBtn = document.getElementById('version-check-btn');
    if (tab === 'config') {
        document.getElementById('right-panel-title').textContent = '配置模块';
        if (versionBtn) versionBtn.title = "检测 config.yaml 版本";
    } else {
        document.getElementById('right-panel-title').textContent = '频率词编辑';
        if (versionBtn) versionBtn.title = "检测 frequency_words.txt 版本";
    }

    if (tab === 'frequency') {
        renderFrequencyPanel();
    }
}

// ==========================================
// 9. Frequency 编辑器功能
// ==========================================
function parseFrequencyText(text) {
    const result = {
        globalFilter: [],
        wordGroups: [],
        originalText: text  // 保存原始文本
    };

    const lines = text.split('\n');
    let currentSection = null;
    let currentGroup = null;
    let lastLineWasAlias = false;  // 追踪上一行是否为别名行
    let relatedGroupsBuffer = [];  // 缓存连续的相关组
    let pendingComments = [];  // 缓存待分配的注释行

    // 辅助函数：保存缓存的相关组
    function flushRelatedGroups() {
        if (relatedGroupsBuffer.length > 0) {
            // 如果有多个连续的组，标记它们为相关组
            if (relatedGroupsBuffer.length > 1) {
                relatedGroupsBuffer.forEach((group, idx) => {
                    group.isRelatedGroup = true;
                    group.relatedGroupIndex = idx;
                    group.relatedGroupTotal = relatedGroupsBuffer.length;
                });
            }
            result.wordGroups.push(...relatedGroupsBuffer);
            relatedGroupsBuffer = [];
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // 收集注释行（在 [WORD_GROUPS] 区域内）
        if (trimmed.startsWith('#') && currentSection === 'groups') {
            pendingComments.push(line);
            continue;
        }

        // 跳过注释（非 [WORD_GROUPS] 区域）
        if (trimmed.startsWith('#')) continue;

        // 空行：结束当前词组和相关组缓存
        if (!trimmed) {
            if (currentGroup) {
                // 保存当前词组到缓存
                relatedGroupsBuffer.push(currentGroup);
                currentGroup = null;
            }
            // 空行表示相关组结束，刷新缓存
            flushRelatedGroups();
            lastLineWasAlias = false;
            // 在 [WORD_GROUPS] 区域内，空行加入待分配注释（保留空行结构）
            if (currentSection === 'groups') {
                pendingComments.push('');
            }
            continue;
        }

        // 检测区域标记
        if (trimmed === '[GLOBAL_FILTER]') {
            currentSection = 'global';
            continue;
        }
        if (trimmed === '[WORD_GROUPS]') {
            currentSection = 'groups';
            continue;
        }

        // 处理内容
        if (currentSection === 'global') {
            result.globalFilter.push(trimmed);
        } else if (currentSection === 'groups') {
            // 检测组别名 [组名]
            const groupNameMatch = trimmed.match(/^\[([^\]]+)\]$/);
            if (groupNameMatch && !['GLOBAL_FILTER', 'WORD_GROUPS'].includes(groupNameMatch[1])) {
                // 保存当前词组到缓存
                if (currentGroup) {
                    relatedGroupsBuffer.push(currentGroup);
                }
                // 刷新缓存（组别名独立成组）
                flushRelatedGroups();
                // 创建组别名类型
                currentGroup = {
                    type: 'group-name',
                    name: groupNameMatch[1],
                    keywords: [],
                    startLine: i,
                    precedingComments: pendingComments.length > 0 ? [...pendingComments] : []
                };
                pendingComments = [];
                lastLineWasAlias = false;
            } else {
                // 检测 => 别名语法（允许右侧为空）
                const aliasMatch = trimmed.match(/^(.+?)\s*=>\s*(.*)$/);
                if (aliasMatch) {
                    const keyword = aliasMatch[1].trim();
                    const alias = aliasMatch[2].trim();

                    // 关键逻辑：如果上一行也是别名行（无空行分隔），则归入连续别名组
                    if (lastLineWasAlias && currentGroup && (currentGroup.type === 'alias' || currentGroup.type === 'alias-group')) {
                        // 如果当前是单个别名，升级为别名组
                        if (currentGroup.type === 'alias') {
                            currentGroup.type = 'alias-group';
                        }
                        // 添加到别名组
                        currentGroup.items.push({ keyword, alias });
                    } else {
                        // 新的单个别名（可能会升级为别名组）
                        if (currentGroup) {
                            // 保存当前词组到缓存（而不是直接添加到结果）
                            relatedGroupsBuffer.push(currentGroup);
                        }
                        currentGroup = {
                            type: 'alias',
                            items: [{ keyword, alias }],
                            startLine: i,
                            precedingComments: pendingComments.length > 0 ? [...pendingComments] : []
                        };
                        pendingComments = [];
                    }
                    lastLineWasAlias = true;
                } else {
                    // 普通关键词
                    if (!currentGroup || currentGroup.type === 'alias' || currentGroup.type === 'alias-group') {
                        // 如果当前是别名类型，需要先保存到缓存
                        if (currentGroup) {
                            relatedGroupsBuffer.push(currentGroup);
                        }
                        // 创建新的普通词组
                        currentGroup = {
                            type: 'plain',
                            keywords: [],
                            startLine: i,
                            precedingComments: pendingComments.length > 0 ? [...pendingComments] : []
                        };
                        pendingComments = [];
                    }
                    currentGroup.keywords.push(trimmed);
                    lastLineWasAlias = false;
                }
            }
        }
    }

    // 添加最后一个组
    if (currentGroup) {
        relatedGroupsBuffer.push(currentGroup);
    }
    flushRelatedGroups();

    return result;
}

function buildFrequencyText(data) {
    // 如果有原始文本，尝试保留注释
    if (data.originalText) {
        const lines = data.originalText.split('\n');
        let result = [];

        // 第一步：保留文件头部的注释
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed === '[GLOBAL_FILTER]') {
                break;
            }
            result.push(line);
            i++;
        }

        // 第二步：重建 [GLOBAL_FILTER] 区域
        result.push('[GLOBAL_FILTER]');

        // 保留 [GLOBAL_FILTER] 后面的注释（直到第一个非注释非空行）
        i++;
        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed.startsWith('#') || trimmed === '') {
                result.push(line);
                i++;
            } else {
                break;
            }
        }

        // 添加全局过滤词
        data.globalFilter.forEach(filter => {
            result.push(filter);
        });

        // 跳过原始文件中的 [GLOBAL_FILTER] 内容（非注释行），保留空行和注释直到 [WORD_GROUPS]
        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed === '[WORD_GROUPS]') {
                break;
            }
            // 保留注释和空行
            if (trimmed.startsWith('#') || trimmed === '') {
                result.push(line);
            }
            i++;
        }

        // 第三步：重建 [WORD_GROUPS] 区域
        result.push('[WORD_GROUPS]');

        // 添加词组（注释已保存在每个词组的 precedingComments 中）
        data.wordGroups.forEach((group, index) => {
            // 先输出词组前的注释
            if (group.precedingComments && group.precedingComments.length > 0) {
                group.precedingComments.forEach(comment => {
                    result.push(comment);
                });
            }

            if (group.type === 'group-name') {
                // 组别名类型：[组名] + 关键词
                if (group.name) {
                    result.push(`[${group.name}]`);
                }
                group.keywords.forEach(kw => {
                    result.push(kw);
                });
            } else if (group.type === 'alias' || group.type === 'alias-group') {
                // 别名类型：keyword => alias
                group.items.forEach(item => {
                    result.push(`${item.keyword} => ${item.alias}`);
                });
            } else if (group.type === 'plain') {
                // 普通词组
                group.keywords.forEach(kw => {
                    result.push(kw);
                });
            }

            // 空行处理逻辑：
            // 1. 如果当前词组和下一个词组都是相关组，则不添加空行
            // 2. 否则，在词组之间添加空行
            const isLastGroup = index === data.wordGroups.length - 1;
            const nextGroup = !isLastGroup ? data.wordGroups[index + 1] : null;

            // 简化判断：只要当前和下一个都是相关组，就不添加空行
            const bothAreRelatedGroups = group.isRelatedGroup && nextGroup && nextGroup.isRelatedGroup;

            // 如果下一个词组有前置注释，不需要额外添加空行（注释中已包含空行）
            const nextHasComments = nextGroup && nextGroup.precedingComments && nextGroup.precedingComments.length > 0;

            if (bothAreRelatedGroups) {
                // 相关组内部不添加空行
                // 不添加任何内容
            } else if (!isLastGroup && !nextHasComments) {
                // 词组之间添加空行（如果下一个没有前置注释）
                result.push('');
            } else if (isLastGroup) {
                // 最后一个词组后也保留一个空行
                result.push('');
            }
        });

        return result.join('\n');
    }

    // 如果没有原始文本，使用默认模板
    let text = '# ═══════════════════════════════════════════════════════════════\n';
    text += '#                    TrendRadar 频率词配置文件\n';
    text += '# ═══════════════════════════════════════════════════════════════\n\n';

    text += '[GLOBAL_FILTER]\n';
    data.globalFilter.forEach(filter => {
        text += filter + '\n';
    });
    text += '\n\n';

    text += '[WORD_GROUPS]\n\n';
    data.wordGroups.forEach((group, index) => {
        // 先输出词组前的注释
        if (group.precedingComments && group.precedingComments.length > 0) {
            group.precedingComments.forEach(comment => {
                text += comment + '\n';
            });
        }

        if (group.type === 'group-name') {
            if (group.name) {
                text += `[${group.name}]\n`;
            }
            group.keywords.forEach(kw => {
                text += kw + '\n';
            });
        } else if (group.type === 'alias' || group.type === 'alias-group') {
            group.items.forEach(item => {
                text += `${item.keyword} => ${item.alias}\n`;
            });
        } else if (group.type === 'plain') {
            group.keywords.forEach(kw => {
                text += kw + '\n';
            });
        }

        // 空行处理逻辑：与上面保持一致
        const isLastGroup = index === data.wordGroups.length - 1;
        const nextGroup = !isLastGroup ? data.wordGroups[index + 1] : null;

        const bothAreRelatedGroups = group.isRelatedGroup && nextGroup && nextGroup.isRelatedGroup;

        // 如果下一个词组有前置注释，不需要额外添加空行
        const nextHasComments = nextGroup && nextGroup.precedingComments && nextGroup.precedingComments.length > 0;

        if (bothAreRelatedGroups) {
            // 相关组内部不添加空行
        } else if (!isLastGroup && !nextHasComments) {
            text += '\n';  // 词组之间用空行分隔
        } else if (isLastGroup) {
            text += '\n';  // 最后一个词组后也保留一个空行
        }
    });

    return text;
}

function syncFrequencyToUI() {
    const data = parseFrequencyText(currentFrequency);
    currentFrequencyData = data;
    renderFrequencyPanel(data);
}

function renderFrequencyPanel(data) {
    if (!data) {
        data = parseFrequencyText(currentFrequency);
    }

    const panel = document.getElementById('frequency-panel');

    // 辅助函数：根据关键词类型返回样式类
    function getKeywordClass(keyword) {
        if (keyword.startsWith('+')) return 'bg-green-500';
        if (keyword.startsWith('!')) return 'bg-red-500';
        if (keyword.startsWith('@')) return 'bg-purple-500';
        if (keyword.startsWith('/') || keyword.includes('=>')) return 'bg-indigo-500';
        return 'bg-blue-500';
    }

    // 辅助函数：为关键词添加标签
    function getKeywordLabel(keyword) {
        if (keyword.startsWith('+')) return '必须';
        if (keyword.startsWith('!')) return '排除';
        if (keyword.startsWith('@')) return '限制';
        if (keyword.startsWith('/')) return '正则';
        if (keyword.includes('=>')) return '别名';
        return '';
    }

    // 渲染词组卡片
    function renderGroupCard(group, idx) {
        const jumpIcon = `<i class="fa-solid fa-grip-vertical text-gray-400 text-xs mr-2" title="拖动调整顺序"></i>`;

        // 序号标记
        const indexBadge = `<span class="text-xs bg-gray-700 text-white px-2.5 py-1 rounded-full font-bold mr-2" title="词组序号">#${idx + 1}</span>`;

        // 相关组标记
        const relatedGroupBadge = group.isRelatedGroup
            ? `<span class="text-[10px] bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-2 py-0.5 rounded font-bold ml-2" title="此组与相邻组相关（无空行分隔）">
                <i class="fa-solid fa-link mr-1"></i>相关组 ${group.relatedGroupIndex + 1}/${group.relatedGroupTotal}
               </span>`
            : '';

        // 相关组边框样式
        const relatedGroupStyle = group.isRelatedGroup
            ? 'border-l-4 border-l-blue-500 shadow-lg'
            : '';

        if (group.type === 'group-name') {
            // 组别名类型
            return `
                <div class="word-group-card border-2 border-orange-200 bg-orange-50 group ${relatedGroupStyle} cursor-move" data-group-index="${idx}" onclick="scrollToWordGroupInEditor(${idx})">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center flex-1 gap-2">
                            ${jumpIcon}
                            ${indexBadge}
                            <span class="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded font-bold">组别名</span>
                            ${relatedGroupBadge}
                            <input type="text" value="${group.name || ''}" placeholder="组别名（如：东亚）"
                                   class="text-sm font-bold border-0 border-b-2 border-orange-300 focus:border-orange-500 outline-none px-2 py-1 flex-1 bg-transparent"
                                   onclick="event.stopPropagation()"
                                   onchange="updateGroupName(${idx}, this.value)">
                        </div>
                        <button onclick="event.stopPropagation(); removeWordGroup(${idx})" class="text-red-500 hover:text-red-700 text-xs ml-2">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    <div class="bg-white rounded p-3 border border-orange-200 editable-area" onclick="event.stopPropagation()">
                        <div class="text-xs text-gray-600 mb-2 font-bold">关键词列表：</div>
                        <div class="tag-input-container">
                            ${group.keywords.map(kw => {
                                const label = getKeywordLabel(kw);
                                const escapedKw = kw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                                return `
                                    <span class="tag-item ${getKeywordClass(kw)} relative break-all cursor-pointer" data-keyword="${escapedKw}" onclick="editKeyword(${idx}, this.dataset.keyword, this)">
                                        ${label ? `<span class="text-[9px] opacity-75 mr-1">[${label}]</span>` : ''}
                                        ${escapedKw}
                                        <button data-keyword="${escapedKw}" onclick="event.stopPropagation(); removeKeyword(${idx}, this.dataset.keyword)">×</button>
                                    </span>
                                `;
                            }).join('')}
                            <input type="text" class="tag-input" placeholder="输入关键词后按回车..."
                                   onkeydown="handleKeywordInput(event, ${idx})">
                        </div>
                        <div class="flex items-center justify-between mt-2">
                            <button onclick="openDeepSeekAI('group', ${idx})" class="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                <i class="fa-solid fa-wand-magic-sparkles"></i>AI 写正则
                            </button>
                            <div class="text-[10px] text-gray-400">${group.keywords.length} 个关键词</div>
                        </div>
                    </div>
                </div>
            `;
        } else if (group.type === 'alias') {
            // 单个别名类型
            const item = group.items[0];
            return `
                <div class="word-group-card border-2 border-teal-200 bg-teal-50 group ${relatedGroupStyle} cursor-move" data-group-index="${idx}" onclick="scrollToWordGroupInEditor(${idx})">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center flex-1 gap-2">
                            ${jumpIcon}
                            ${indexBadge}
                            <span class="text-[10px] bg-teal-500 text-white px-2 py-0.5 rounded font-bold">单个别名</span>
                            ${relatedGroupBadge}
                        </div>
                        <button onclick="event.stopPropagation(); removeWordGroup(${idx})" class="text-red-500 hover:text-red-700 text-xs">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    <div class="bg-white rounded p-3 border border-teal-200 editable-area" onclick="event.stopPropagation()">
                        <div class="flex items-center gap-2">
                            <input type="text" value="${item.keyword || ''}" placeholder="/正则/ 或 关键词"
                                   class="flex-1 px-3 py-2 border border-gray-300 rounded focus:border-teal-500 outline-none text-sm font-mono"
                                   onblur="updateAliasItem(${idx}, 0, 'keyword', this.value)">
                            <span class="text-teal-600 font-bold">=></span>
                            <input type="text" value="${item.alias || ''}" placeholder="别名"
                                   class="flex-1 px-3 py-2 border border-gray-300 rounded focus:border-teal-500 outline-none text-sm"
                                   onblur="updateAliasItem(${idx}, 0, 'alias', this.value)">
                        </div>
                        <div class="flex items-center justify-between mt-2">
                            <button onclick="openDeepSeekAI('group', ${idx})" class="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                <i class="fa-solid fa-wand-magic-sparkles"></i>AI 写正则
                            </button>
                            <div class="text-[10px] text-gray-500">
                                <i class="fa-solid fa-lightbulb mr-1"></i>示例：/胖东来|于东来/ => 胖东来
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (group.type === 'alias-group') {
            // 连续别名组类型
            return `
                <div class="word-group-card border-2 border-purple-200 bg-purple-50 group ${relatedGroupStyle} cursor-move" data-group-index="${idx}" onclick="scrollToWordGroupInEditor(${idx})">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center flex-1 gap-2">
                            ${jumpIcon}
                            ${indexBadge}
                            <span class="text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded font-bold">连续别名组</span>
                            ${relatedGroupBadge}
                        </div>
                        <button onclick="event.stopPropagation(); removeWordGroup(${idx})" class="text-red-500 hover:text-red-700 text-xs">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    <div class="bg-white rounded p-3 border border-purple-200 space-y-2 editable-area" onclick="event.stopPropagation()">
                        <div class="text-xs text-gray-600 mb-2 font-bold">
                            别名列表（无空行分隔）：
                        </div>
                        ${group.items.map((item, itemIdx) => `
                            <div class="flex items-center gap-2">
                                <input type="text" value="${item.keyword || ''}" placeholder="/正则/ 或 关键词"
                                       class="flex-1 px-3 py-2 border border-gray-300 rounded focus:border-purple-500 outline-none text-sm font-mono"
                                       onblur="updateAliasItem(${idx}, ${itemIdx}, 'keyword', this.value)">
                                <span class="text-purple-600 font-bold">=></span>
                                <input type="text" value="${item.alias || ''}" placeholder="别名"
                                       class="flex-1 px-3 py-2 border border-gray-300 rounded focus:border-purple-500 outline-none text-sm"
                                       onblur="updateAliasItem(${idx}, ${itemIdx}, 'alias', this.value)">
                                <button onclick="removeAliasItem(${idx}, ${itemIdx})" class="text-red-500 hover:text-red-700 text-xs">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        `).join('')}
                        <div class="flex items-center justify-between mt-2">
                            <button onclick="openDeepSeekAI('group', ${idx})" class="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                <i class="fa-solid fa-wand-magic-sparkles"></i>AI 写正则
                            </button>
                            <div class="text-[10px] text-gray-500">
                                <i class="fa-solid fa-info-circle mr-1"></i>这些别名行在配置文件中无空行分隔，属于同一组
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (group.type === 'plain') {
            // 普通词组类型
            return `
                <div class="word-group-card border-2 border-gray-200 bg-gray-50 group ${relatedGroupStyle} cursor-move" data-group-index="${idx}" onclick="scrollToWordGroupInEditor(${idx})">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center flex-1 gap-2">
                            ${jumpIcon}
                            ${indexBadge}
                            <span class="text-[10px] bg-gray-500 text-white px-2 py-0.5 rounded font-bold">普通词组</span>
                            ${relatedGroupBadge}
                        </div>
                        <button onclick="event.stopPropagation(); removeWordGroup(${idx})" class="text-red-500 hover:text-red-700 text-xs">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    <div class="bg-white rounded p-3 border border-gray-200 editable-area" onclick="event.stopPropagation()">
                        <div class="tag-input-container">
                            ${group.keywords.map(kw => {
                                const label = getKeywordLabel(kw);
                                const escapedKw = kw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                                return `
                                    <span class="tag-item ${getKeywordClass(kw)} relative break-all cursor-pointer" data-keyword="${escapedKw}" onclick="editKeyword(${idx}, this.dataset.keyword, this)">
                                        ${label ? `<span class="text-[9px] opacity-75 mr-1">[${label}]</span>` : ''}
                                        ${escapedKw}
                                        <button data-keyword="${escapedKw}" onclick="event.stopPropagation(); removeKeyword(${idx}, this.dataset.keyword)">×</button>
                                    </span>
                                `;
                            }).join('')}
                            <input type="text" class="tag-input" placeholder="输入关键词后按回车..."
                                   onkeydown="handleKeywordInput(event, ${idx})">
                        </div>
                        <div class="flex items-center justify-between mt-2">
                            <button onclick="openDeepSeekAI('group', ${idx})" class="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                <i class="fa-solid fa-wand-magic-sparkles"></i>AI 写正则
                            </button>
                            <div class="text-[10px] text-gray-400">${group.keywords.length} 个关键词</div>
                        </div>
                    </div>
                </div>
            `;
        }
        return '';
    }

    panel.innerHTML = `
        <!-- 规则说明区域 -->
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-4 mb-4">
            <div class="flex items-start gap-3">
                <i class="fa-solid fa-book text-blue-600 text-lg mt-0.5"></i>
                <div class="flex-1">
                    <h3 class="text-sm font-bold text-gray-800 mb-2">四种词组类型说明</h3>
                    <div class="grid grid-cols-2 gap-3 text-xs">
                        <div class="bg-white rounded p-2 border-l-4 border-orange-500">
                            <div class="font-bold text-orange-700 mb-1">组别名</div>
                            <div class="text-gray-600 font-mono text-[10px] mb-1">[东亚]<br>日本<br>韩国</div>
                            <div class="text-gray-500 text-[10px]">多个关键词，统一显示为组名</div>
                        </div>
                        <div class="bg-white rounded p-2 border-l-4 border-teal-500">
                            <div class="font-bold text-teal-700 mb-1">单个别名</div>
                            <div class="text-gray-600 font-mono text-[10px] mb-1">/胖东来|于东来/ => 胖东来</div>
                            <div class="text-gray-500 text-[10px]">正则匹配，显示为别名</div>
                        </div>
                        <div class="bg-white rounded p-2 border-l-4 border-purple-500">
                            <div class="font-bold text-purple-700 mb-1">连续别名组</div>
                            <div class="text-gray-600 font-mono text-[10px] mb-1">/智元|稚晖君/ => 智元<br>/众擎|EngineAI/ => 众擎</div>
                            <div class="text-gray-500 text-[10px]">多个别名无空行分隔</div>
                        </div>
                        <div class="bg-white rounded p-2 border-l-4 border-gray-500">
                            <div class="font-bold text-gray-700 mb-1">普通词组</div>
                            <div class="text-gray-600 font-mono text-[10px] mb-1">申奥</div>
                            <div class="text-gray-500 text-[10px]">普通关键词</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Global Filter 区域 -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-bold text-gray-700">
                    <i class="fa-solid fa-filter mr-2"></i>全局过滤词
                </h3>
                <button onclick="openDeepSeekAI('global')" class="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>AI 写正则
                </button>
            </div>
            <div id="global-filter-tags" class="tag-input-container">
                ${data.globalFilter.map(f => `
                    <span class="tag-item ${getKeywordClass(f)}">
                        ${f}
                        <button onclick="removeGlobalFilter('${f.replace(/'/g, "\\'")}')">×</button>
                    </span>
                `).join('')}
                <input type="text" class="tag-input" placeholder="输入过滤词后按回车..." onkeydown="handleGlobalFilterInput(event)">
            </div>
            <div class="text-xs text-gray-500 mt-2">
                <i class="fa-solid fa-lightbulb mr-1"></i>提示：支持正则表达式（用 /.../ 包裹）
            </div>
        </div>

        <!-- Word Groups 区域 -->
        <div class="bg-white rounded-lg border border-gray-200 p-5">
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-bold text-gray-700">
                    <i class="fa-solid fa-layer-group mr-2"></i>关键词组 <span class="text-xs text-gray-400 font-normal">(${data.wordGroups.length} 个词组)</span>
                </h3>
                <button onclick="addWordGroup('top')" class="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
                    <i class="fa-solid fa-plus mr-1"></i>添加词组
                </button>
            </div>
            <div id="word-groups-container" class="space-y-3">
                ${data.wordGroups.map((group, idx) => {
                    const card = renderGroupCard(group, idx);
                    // 在每个词组后添加插入区域（最后一个除外）
                    if (idx < data.wordGroups.length - 1) {
                        return card + `
                            <div class="insert-zone group/insert" data-insert-index="${idx + 1}">
                                <button onclick="insertWordGroupAt(${idx + 1})" class="insert-button">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                            </div>
                        `;
                    }
                    return card;
                }).join('')}
            </div>

            <!-- 底部添加按钮 -->
            <div class="mt-4 flex justify-center">
                <button onclick="addWordGroup('bottom')" class="text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-blue-600 hover:to-blue-700 shadow-sm transition-all flex items-center gap-2">
                    <i class="fa-solid fa-plus-circle"></i>
                    <span>在底部添加词组</span>
                </button>
            </div>
        </div>
    `;

    // 初始化拖拽排序功能
    setTimeout(() => {
        const container = document.getElementById('word-groups-container');
        if (container && typeof Sortable !== 'undefined') {
            // 销毁之前的实例（如果存在）
            if (container.sortableInstance) {
                container.sortableInstance.destroy();
            }

            // 创建新的 Sortable 实例
            container.sortableInstance = new Sortable(container, {
                animation: 150,
                filter: '.editable-area, input, button, select, textarea',  // 排除编辑区域
                preventOnFilter: false,  // 允许在过滤区域正常交互
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                dragClass: 'sortable-drag',
                onEnd: function(evt) {
                    // 获取所有词组卡片的当前顺序
                    const cards = Array.from(container.querySelectorAll('.word-group-card'));
                    const newOrder = cards.map(card => parseInt(card.getAttribute('data-group-index')));

                    // 检查顺序是否改变
                    const data = currentFrequencyData || parseFrequencyText(currentFrequency);
                    const oldOrder = data.wordGroups.map((_, idx) => idx);

                    if (JSON.stringify(newOrder) !== JSON.stringify(oldOrder)) {
                        // 根据新顺序重新排列数据
                        const reorderedGroups = newOrder.map(idx => data.wordGroups[idx]);
                        data.wordGroups = reorderedGroups;

                        // 重新构建文本
                        currentFrequency = buildFrequencyText(data);
                        currentFrequencyData = parseFrequencyText(currentFrequency);
                        document.getElementById('frequency-editor').value = currentFrequency;
                        updateBackdrop('frequency-editor', 'frequency-backdrop');

                        // 重新渲染
                        renderFrequencyPanel(currentFrequencyData);
                    }
                }
            });
        }
    }, 0);
}

// Global Filter 操作
window.handleGlobalFilterInput = function(event) {
    if (event.key === 'Enter' && event.target.value.trim()) {
        const data = currentFrequencyData || parseFrequencyText(currentFrequency);
        data.globalFilter.push(event.target.value.trim());
        currentFrequency = buildFrequencyText(data);
        currentFrequencyData = data;
        document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
        renderFrequencyPanel(data);
    }
}

window.removeGlobalFilter = function(filter) {
    const data = currentFrequencyData || parseFrequencyText(currentFrequency);
    data.globalFilter = data.globalFilter.filter(f => f !== filter);
    currentFrequency = buildFrequencyText(data);
    currentFrequencyData = data;
    document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
    renderFrequencyPanel(data);
}

// Word Groups 操作
let pendingWordGroupPosition = 'top';  // 记录添加位置：'top', 'bottom', 或数字索引

window.addWordGroup = function(position = 'top') {
    pendingWordGroupPosition = position;
    document.getElementById('wordgroup-type-modal').classList.remove('hidden');
}

// 在指定位置插入词组
window.insertWordGroupAt = function(index) {
    pendingWordGroupPosition = index;  // 记录插入位置（数字索引）
    document.getElementById('wordgroup-type-modal').classList.remove('hidden');
}

window.closeWordGroupTypeModal = function() {
    document.getElementById('wordgroup-type-modal').classList.add('hidden');
}

window.confirmAddWordGroup = function(type) {
    const data = currentFrequencyData || parseFrequencyText(currentFrequency);
    let newGroup;

    if (type === 'group') {
        // 组别名类型
        newGroup = { type: 'group-name', name: '', keywords: [] };
    } else if (type === 'alias') {
        // 单个别名类型
        newGroup = { type: 'alias', items: [{ keyword: '', alias: '' }] };
    } else if (type === 'multi-alias') {
        // 连续别名类型（多个别名行）
        newGroup = { type: 'alias-group', items: [{ keyword: '', alias: '' }, { keyword: '', alias: '' }] };
    } else if (type === 'plain') {
        // 普通词组类型
        newGroup = { type: 'plain', keywords: [] };
    }

    // 根据位置插入
    if (pendingWordGroupPosition === 'bottom') {
        data.wordGroups.push(newGroup);
    } else if (pendingWordGroupPosition === 'top') {
        data.wordGroups.unshift(newGroup);
    } else if (typeof pendingWordGroupPosition === 'number') {
        // 在指定索引位置插入
        data.wordGroups.splice(pendingWordGroupPosition, 0, newGroup);
    }

    currentFrequency = buildFrequencyText(data);
    currentFrequencyData = data;
    document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
    renderFrequencyPanel(data);

    closeWordGroupTypeModal();

    // 滚动到新添加的词组
    setTimeout(() => {
        const container = document.getElementById('word-groups-container');
        if (pendingWordGroupPosition === 'bottom') {
            container.scrollTop = container.scrollHeight;
        } else if (pendingWordGroupPosition === 'top') {
            container.scrollTop = 0;
        } else if (typeof pendingWordGroupPosition === 'number') {
            // 滚动到插入的位置
            const cards = container.querySelectorAll('.word-group-card');
            if (cards[pendingWordGroupPosition]) {
                cards[pendingWordGroupPosition].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, 100);
}

window.removeWordGroup = function(index) {
    const data = currentFrequencyData || parseFrequencyText(currentFrequency);
    data.wordGroups.splice(index, 1);
    currentFrequency = buildFrequencyText(data);
    // 重新解析以更新相关组信息
    currentFrequencyData = parseFrequencyText(currentFrequency);
    document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
    renderFrequencyPanel(currentFrequencyData);
}

window.updateGroupName = function(index, name) {
    const data = currentFrequencyData || parseFrequencyText(currentFrequency);
    const group = data.wordGroups[index];

    // 只有 group-name 类型才有 name 字段
    if (group.type === 'group-name') {
        group.name = name;
    }

    currentFrequency = buildFrequencyText(data);
    // 重新解析以更新相关组信息
    currentFrequencyData = parseFrequencyText(currentFrequency);
    document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
    renderFrequencyPanel(currentFrequencyData);
}

window.editKeyword = function(groupIndex, oldKeyword, spanElement) {
    const data = currentFrequencyData || parseFrequencyText(currentFrequency);
    const group = data.wordGroups[groupIndex];

    // 只有 group-name 和 plain 类型才有 keywords 字段
    if (group.type !== 'group-name' && group.type !== 'plain') {
        return;
    }

    const originalKeyword = group.keywords.find(kw => kw === oldKeyword) || oldKeyword;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalKeyword;
    input.className = 'tag-input inline-block px-2 py-1 text-xs border border-blue-500 rounded';
    input.style.minWidth = '100px';

    const saveEdit = () => {
        const newKeyword = input.value.trim();
        if (newKeyword && newKeyword !== originalKeyword) {
            const kwIndex = group.keywords.indexOf(originalKeyword);
            if (kwIndex !== -1) {
                group.keywords[kwIndex] = newKeyword;
            }
            currentFrequency = buildFrequencyText(data);
            // 重新解析以更新相关组信息
            currentFrequencyData = parseFrequencyText(currentFrequency);
            document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
            renderFrequencyPanel(currentFrequencyData);
        } else {
            spanElement.style.display = '';
            input.remove();
        }
    };

    input.onblur = saveEdit;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            spanElement.style.display = '';
            input.remove();
        }
    };

    spanElement.style.display = 'none';
    spanElement.parentNode.insertBefore(input, spanElement);
    input.focus();
    input.select();
}

window.handleKeywordInput = function(event, groupIndex) {
    if (event.key === 'Enter' && event.target.value.trim()) {
        const data = currentFrequencyData || parseFrequencyText(currentFrequency);
        const group = data.wordGroups[groupIndex];

        // 只有 group-name 和 plain 类型才能添加关键词
        if (group.type === 'group-name' || group.type === 'plain') {
            group.keywords.push(event.target.value.trim());
            event.target.value = '';

            currentFrequency = buildFrequencyText(data);
            // 重新解析以更新相关组信息
            currentFrequencyData = parseFrequencyText(currentFrequency);
            document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
            renderFrequencyPanel(currentFrequencyData);
        }
    }
}

window.removeKeyword = function(groupIndex, keyword) {
    const data = currentFrequencyData || parseFrequencyText(currentFrequency);
    const group = data.wordGroups[groupIndex];

    // 只有 group-name 和 plain 类型才能删除关键词
    if (group.type === 'group-name' || group.type === 'plain') {
        group.keywords = group.keywords.filter(k => k !== keyword);

        // 如果词组变空，删除整个词组
        if (group.keywords.length === 0) {
            data.wordGroups.splice(groupIndex, 1);
        }

        currentFrequency = buildFrequencyText(data);
        // 重新解析以更新相关组信息
        currentFrequencyData = parseFrequencyText(currentFrequency);
        document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
        renderFrequencyPanel(currentFrequencyData);
    }
}

// 更新别名项
window.updateAliasItem = function(groupIndex, itemIndex, field, value) {
    const data = currentFrequencyData || parseFrequencyText(currentFrequency);
    const group = data.wordGroups[groupIndex];

    // 只有 alias 和 alias-group 类型才有 items 字段
    if (group.type === 'alias' || group.type === 'alias-group') {
        if (group.items[itemIndex]) {
            group.items[itemIndex][field] = value;

            currentFrequency = buildFrequencyText(data);
            currentFrequencyData = parseFrequencyText(currentFrequency);
            document.getElementById('frequency-editor').value = currentFrequency;
            updateBackdrop('frequency-editor', 'frequency-backdrop');
            renderFrequencyPanel(currentFrequencyData);
        }
    }
}

// 添加别名项
window.addAliasItem = function(groupIndex) {
    const data = currentFrequencyData || parseFrequencyText(currentFrequency);
    const group = data.wordGroups[groupIndex];

    // 只有 alias-group 类型才能添加别名项
    if (group.type === 'alias-group') {
        group.items.push({ keyword: '', alias: '' });

        currentFrequency = buildFrequencyText(data);
        // 重新解析以更新相关组信息
        currentFrequencyData = parseFrequencyText(currentFrequency);
        document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
        renderFrequencyPanel(currentFrequencyData);
    } else if (group.type === 'alias') {
        // 如果是单个别名，升级为别名组
        group.type = 'alias-group';
        group.items.push({ keyword: '', alias: '' });

        currentFrequency = buildFrequencyText(data);
        // 重新解析以更新相关组信息
        currentFrequencyData = parseFrequencyText(currentFrequency);
        document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
        renderFrequencyPanel(currentFrequencyData);
    }
}

// 删除别名项
window.removeAliasItem = function(groupIndex, itemIndex) {
    const data = currentFrequencyData || parseFrequencyText(currentFrequency);
    const group = data.wordGroups[groupIndex];

    // 只有 alias-group 类型才能删除别名项
    if (group.type === 'alias-group') {
        group.items.splice(itemIndex, 1);

        // 如果没有别名项了，删除整个词组
        if (group.items.length === 0) {
            data.wordGroups.splice(groupIndex, 1);
        }
        // 如果只剩一个别名项，降级为单个别名
        else if (group.items.length === 1) {
            group.type = 'alias';
        }

        currentFrequency = buildFrequencyText(data);
        currentFrequencyData = parseFrequencyText(currentFrequency);
        document.getElementById('frequency-editor').value = currentFrequency;
    updateBackdrop('frequency-editor', 'frequency-backdrop');
        renderFrequencyPanel(currentFrequencyData);
    }
}

// DeepSeek AI 辅助
window.openDeepSeekAI = function(type, groupIndex) {
    const userInput = window.prompt('请输入核心关键词（例如：华为）：');
    if (!userInput) return;

    const promptText = `我正在配置一个新闻聚合系统，需要通过 Python 正则表达式 抓取关于【${userInput}】的新闻。

请帮我完成以下步骤，并最终只输出一个正则表达式字符串：

第一步：【精准关键词筛选】
请列出与【${userInput}】强绑定的核心词汇：
1. 核心品牌：包括中文全称、简称、股票代码、别名。
2. 核心人物：仅限最高决策层或极具代表性的创始人。
3. 独家产品：必须是具有极高辨识度的独家产品名。
4. 核心工作室/子品牌：强相关的下属机构。

第二步：【严格清洗与过滤】（请严格执行）
1. 包含关系去重（最短匹配原则）：
   - 中文：如果列表里已经有了核心短词（如“腾讯”），请删除所有包含该短词的长词（如“腾讯云”、“腾讯视频”统统不要，因为它们会被短词命中）。
   - 英文：如果有了 \\bKeyword\\b，就不要再出现 Keyword。
2. 彻底排除无关公司：
   - 绝对不要包含：该品牌的竞争对手、合作伙伴（如京东、美团、字节跳动等非隶属公司）。
3. 彻底排除通用黑话：
   - 绝对不要包含：行业通用词（如“互联网”、“大厂”、“新质生产力”、“人工智能”、“元宇宙”、“金融科技”等）。

第三步：【构建 Python 正则】
将清洗后的词汇合并，格式要求如下：
1. 英文处理：所有英文单词必须前后加 \\b（例如 \\bWord\\b），严禁出现没有边界符的英文单词。
2. 连接符：用 | 连接。

最终输出示例格式：
/词A|词B|\\bEnglishWord\\b/ => ${userInput}

输出要求：
- 只要这一行正则表达式，不要任何解释，不要代码块。`;

    const textArea = document.createElement("textarea");
    textArea.value = promptText;

    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);

    textArea.focus();
    textArea.select();

    let copySuccess = false;
    try {
        copySuccess = document.execCommand('copy');
    } catch (err) {
        console.error('复制失败:', err);
    }

    document.body.removeChild(textArea);

    if (copySuccess) {
        if (confirm(`提示词已复制到剪贴板！\n\n关键词：${userInput}\n\n点击【确定】跳转 DeepSeek 官网，直接粘贴 (Ctrl+V) 即可。`)) {
            window.open('https://chat.deepseek.com/', '_blank');
        }
    } else {
        prompt('自动复制失败，请手动复制以下内容，然后自行打开 DeepSeek:', promptText);
        window.open('https://chat.deepseek.com/', '_blank');
    }
}

// ==========================================
// 10. 平台管理功能
// ==========================================

// 解析当前配置中的平台列表
function parsePlatformsFromYaml() {
    try {
        const doc = jsyaml.load(currentYaml);
        if (doc && doc.platforms && doc.platforms.sources) {
            return doc.platforms.sources;
        }
    } catch (e) {}
    return [];
}

// 渲染平台列表
function renderPlatformsList() {
    const container = document.getElementById('platforms-list');
    if (!container) return;

    const platforms = parsePlatformsFromYaml();

    if (platforms.length === 0) {
        container.innerHTML = `<div class="text-xs text-gray-400 italic">暂无平台，请添加</div>`;
        return;
    }

    container.innerHTML = platforms.map((p, idx) => `
        <div class="platform-item flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 hover:border-blue-300 transition-colors" data-index="${idx}">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-grip-vertical text-gray-300 cursor-move"></i>
                <span class="text-xs font-medium text-gray-700">${p.name}</span>
                <span class="text-[10px] text-gray-400">(${p.id})</span>
            </div>
            <button onclick="removePlatform(${idx})" class="text-red-400 hover:text-red-600 text-xs" title="删除">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('');

    // 初始化拖拽排序
    if (typeof Sortable !== 'undefined') {
        new Sortable(container, {
            animation: 150,
            handle: '.fa-grip-vertical',
            onEnd: function(evt) {
                reorderPlatforms(evt.oldIndex, evt.newIndex);
            }
        });
    }
}

// 删除平台
window.removePlatform = function(index) {
    const platforms = parsePlatformsFromYaml();
    if (index < 0 || index >= platforms.length) return;

    const platformName = platforms[index].name;
    if (!confirm(`确定要删除平台 "${platformName}" 吗？`)) return;

    platforms.splice(index, 1);
    updatePlatformsInYaml(platforms);
}

// 重新排序平台
function reorderPlatforms(oldIndex, newIndex) {
    const platforms = parsePlatformsFromYaml();
    const [removed] = platforms.splice(oldIndex, 1);
    platforms.splice(newIndex, 0, removed);
    updatePlatformsInYaml(platforms);
}

// 更新 YAML 中的平台配置（保留注释）
function updatePlatformsInYaml(platforms) {
    const editor = document.getElementById('yaml-editor');
    let yaml = editor.value;
    const lines = yaml.split('\n');

    // 找到 platforms.sources 的位置
    let sourcesStart = -1;
    let sourcesEnd = -1;
    let inPlatforms = false;
    let inSources = false;
    let baseIndent = 0;
    let lastDataLineIndex = -1; // 记录最后一个数据行的位置

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (line.match(/^platforms:/)) {
            inPlatforms = true;
            continue;
        }

        if (inPlatforms && !inSources && trimmed.startsWith('sources:')) {
            sourcesStart = i + 1;
            inSources = true;
            baseIndent = line.search(/\S/) + 2; // sources 下一级的缩进
            continue;
        }

        if (inSources) {
            const currentIndent = line.search(/\S/);

            // 如果是数据行（以 - 开头或是数据项的属性）
            if (trimmed.startsWith('-')) {
                lastDataLineIndex = i;
            } else if (trimmed && !trimmed.startsWith('#') && currentIndent >= baseIndent) {
                // 数据项的属性行（如 name:, id:）
                lastDataLineIndex = i;
            } else if (trimmed && !trimmed.startsWith('#') && currentIndent < baseIndent) {
                // 遇到缩进更小的非注释行，说明离开了 sources 区域
                sourcesEnd = lastDataLineIndex + 1;
                break;
            }
        }

        // 检查是否进入下一个顶级模块
        if (inPlatforms && line.match(/^[a-z_]+:/) && !line.match(/^platforms:/)) {
            if (lastDataLineIndex >= 0) {
                sourcesEnd = lastDataLineIndex + 1;
            } else {
                sourcesEnd = i;
            }
            break;
        }
    }

    // 如果没有找到结束位置，使用最后一个数据行的下一行
    if (sourcesEnd === -1) {
        sourcesEnd = lastDataLineIndex >= 0 ? lastDataLineIndex + 1 : lines.length;
    }

    // 提取区域内的注释（保留在开头的注释）
    const regionLines = lines.slice(sourcesStart, sourcesEnd);
    const leadingComments = [];
    for (const line of regionLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
            leadingComments.push(line);
        } else if (trimmed.startsWith('-') || (trimmed && !trimmed.startsWith('#'))) {
            // 遇到第一个数据项，停止收集注释
            break;
        } else if (trimmed === '') {
            // 空行也保留
            leadingComments.push(line);
        }
    }

    const indent = '    '; // 4 空格缩进
    const newSourcesLines = platforms.map(p =>
        `${indent}- id: "${p.id}"\n${indent}  name: "${p.name}"`
    ).join('\n');

    const beforeSources = lines.slice(0, sourcesStart);
    const afterSources = lines.slice(sourcesEnd);

    // 组合：前面内容 + 开头注释 + 新数据 + 后面内容
    const newYaml = [
        ...beforeSources,
        ...(leadingComments.length > 0 ? leadingComments : []),
        newSourcesLines,
        ...afterSources
    ].join('\n');

    editor.value = newYaml;
    currentYaml = newYaml;
    updateBackdrop('yaml-editor', 'yaml-backdrop');
    debounceSaveConfig();
    renderPlatformsList();
    renderStandaloneLists(); // 同步更新独立展示区的平台选择列表
}

// ==========================================
// 12. Display Regions 排序与管理功能
// ==========================================

const DISPLAY_REGIONS_DEF = [
    { key: "hotlist", label: "热榜区域" },
    { key: "new_items", label: "新增热点区域" },
    { key: "rss", label: "RSS 订阅区域" },
    { key: "standalone", label: "独立展示区" },
    { key: "ai_analysis", label: "AI 分析区域" }
];

// 从 YAML 解析 display.regions，严格按照 region_order 定义顺序
function parseDisplayRegionsFromYaml() {
    try {
        const doc = jsyaml.load(currentYaml);
        if (doc && doc.display) {
            const regionOrder = doc.display.region_order || [];
            const regionStates = doc.display.regions || {};

            // 严格按 region_order 顺序构建列表
            if (regionOrder.length > 0) {
                return regionOrder.map(key => {
                    const normalizedKey = key === 'new_item' ? 'new_items' : key;
                    const def = DISPLAY_REGIONS_DEF.find(d => d.key === normalizedKey);
                    return {
                        key: normalizedKey,
                        label: def ? def.label : normalizedKey,
                        enabled: regionStates[normalizedKey] !== undefined ? regionStates[normalizedKey] : false
                    };
                });
            }

            // 后备方案：如果没有 region_order，使用 regions 对象的顺序
            const regions = [];
            for (const key in regionStates) {
                const normalizedKey = key === 'new_item' ? 'new_items' : key;
                const def = DISPLAY_REGIONS_DEF.find(d => d.key === normalizedKey);
                if (def) {
                    regions.push({
                        key: normalizedKey,
                        label: def.label,
                        enabled: regionStates[key]
                    });
                }
            }
            return regions;
        }
    } catch (e) {}

    // 默认返回所有区域（禁用状态）
    return DISPLAY_REGIONS_DEF.map(def => ({
        key: def.key,
        label: def.label,
        enabled: false
    }));
}

// 渲染 Display Regions 列表
function renderDisplayRegionsList() {
    const container = document.getElementById('display-regions-list');
    if (!container) return;

    const regions = parseDisplayRegionsFromYaml();

    container.innerHTML = regions.map((r, idx) => `
        <div class="display-region-item flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 hover:border-blue-300 transition-colors" data-key="${r.key}">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-grip-vertical text-gray-300 cursor-move"></i>
                <span class="text-xs font-medium ${r.enabled ? 'text-gray-700' : 'text-gray-400'}">${r.label}</span>
                <span class="text-[10px] text-gray-400">(${r.key})</span>
            </div>
            <div class="relative inline-block w-10 align-middle select-none">
                <input type="checkbox" id="toggle-region-${r.key}"
                       ${r.enabled ? 'checked' : ''}
                       onchange="toggleDisplayRegion('${r.key}')"
                       class="toggle-checkbox absolute block w-4 h-4 mt-0.5 ml-0.5 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-200 ease-in-out"/>
                <label for="toggle-region-${r.key}" class="toggle-label block overflow-hidden h-5 rounded-full bg-gray-300 cursor-pointer"></label>
            </div>
        </div>
    `).join('');

    // 初始化拖拽排序
    if (typeof Sortable !== 'undefined') {
        new Sortable(container, {
            animation: 150,
            handle: '.fa-grip-vertical',
            onEnd: function(evt) {
                reorderDisplayRegions();
            }
        });
    }
}

// 切换区域启用状态
window.toggleDisplayRegion = function(key) {
    const regions = parseDisplayRegionsFromYaml();
    const target = regions.find(r => r.key === key);
    if (target) {
        target.enabled = !target.enabled;
        updateDisplayRegionsInYaml(regions);
    }
}

// 重新排序区域
window.reorderDisplayRegions = function() {
    const container = document.getElementById('display-regions-list');
    const items = container.querySelectorAll('.display-region-item');
    const newOrderKeys = Array.from(items).map(item => item.dataset.key);

    const currentRegions = parseDisplayRegionsFromYaml();

    const newRegions = newOrderKeys.map(key => {
        return currentRegions.find(r => r.key === key);
    }).filter(r => r); // 过滤掉可能的 undefined

    updateDisplayRegionsInYaml(newRegions);
}

// 更新 YAML 中的 display.regions 和 display.region_order
function updateDisplayRegionsInYaml(regions) {
    const editor = document.getElementById('yaml-editor');
    let yaml = editor.value;
    const lines = yaml.split('\n');

    let regionOrderStart = -1;
    let regionOrderEnd = -1;
    let regionsStart = -1;
    let regionsEnd = -1;
    let inDisplay = false;
    let regionOrderIndent = 0;
    let regionsIndent = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (line.match(/^display:/)) {
            inDisplay = true;
            continue;
        }

        if (!inDisplay) continue;

        // 查找 region_order 数组
        if (trimmed.startsWith('region_order:')) {
            regionOrderStart = i + 1;
            regionOrderIndent = line.search(/\S/) + 2;
            // 找到 region_order 的结束位置
            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j];
                const nextTrimmed = nextLine.trim();
                if (nextTrimmed && !nextTrimmed.startsWith('#') && !nextTrimmed.startsWith('-')) {
                    const nextIndent = nextLine.search(/\S/);
                    if (nextIndent < regionOrderIndent) {
                        regionOrderEnd = j;
                        break;
                    }
                }
            }
            if (regionOrderEnd === -1) regionOrderEnd = lines.length;
            continue;
        }

        // 查找 regions 对象
        if (trimmed.startsWith('regions:')) {
            regionsStart = i + 1;
            regionsIndent = line.search(/\S/) + 2;
            // 找到 regions 的结束位置（遇到同级或更高级的键）
            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j];
                const nextTrimmed = nextLine.trim();
                if (nextTrimmed && !nextTrimmed.startsWith('#')) {
                    const nextIndent = nextLine.search(/\S/);
                    // 检查是否是同级或更高级的键（如 standalone:）
                    if (nextIndent <= line.search(/\S/)) {
                        regionsEnd = j;
                        break;
                    }
                }
            }
            if (regionsEnd === -1) regionsEnd = lines.length;
            break;
        }

        // 检查是否离开 display 模块
        if (line.match(/^[a-z_]+:/) && !line.match(/^display:/)) {
            break;
        }
    }

    // 更新 region_order 数组（保留注释）
    if (regionOrderStart > 0 && regionOrderEnd > regionOrderStart) {
        const indentStr = ' '.repeat(regionOrderIndent);

        // 提取原有行的注释映射
        const originalRegionOrderBlock = lines.slice(regionOrderStart, regionOrderEnd);
        const commentMap = {};

        originalRegionOrderBlock.forEach(line => {
            // 匹配 "- key  # 注释" 格式
            const match = line.match(/^\s*-\s*([a-z_]+)\s*(#.*)?$/);
            if (match) {
                const key = match[1];
                const comment = match[2] || '';
                if (key) commentMap[key] = comment;
            }
        });

        // 生成新的行，保留注释
        const newRegionOrderLines = regions.map(r => {
            const comment = commentMap[r.key] || '';
            return `${indentStr}- ${r.key}${comment ? '                       ' + comment : ''}`;
        });

        lines.splice(regionOrderStart, regionOrderEnd - regionOrderStart, ...newRegionOrderLines);

        // 调整 regionsStart 和 regionsEnd
        const lineDiff = newRegionOrderLines.length - (regionOrderEnd - regionOrderStart);
        if (regionsStart > regionOrderEnd) {
            regionsStart += lineDiff;
            regionsEnd += lineDiff;
        }
    }

    // 更新 regions 对象
    if (regionsStart > 0 && regionsEnd > regionsStart) {
        const originalRegionsBlock = lines.slice(regionsStart, regionsEnd);
        const commentMap = {};

        originalRegionsBlock.forEach(line => {
            const match = line.match(/^\s*([a-z_]+):\s*[^#]*(#.*)?$/);
            if (match) {
                const key = match[1];
                const comment = match[2] || '';
                if (key) commentMap[key] = comment;
            }
        });

        const indentStr = ' '.repeat(regionsIndent);
        const newRegionsLines = regions.map(r => {
            const comment = commentMap[r.key] || '';
            return `${indentStr}${r.key}: ${r.enabled}${comment ? ' ' + comment.trim() : ''}`;
        });

        lines.splice(regionsStart, regionsEnd - regionsStart, ...newRegionsLines);
    }

    editor.value = lines.join('\n');
    currentYaml = lines.join('\n');
    updateBackdrop('yaml-editor', 'yaml-backdrop');
    debounceSaveConfig();

    renderDisplayRegionsList();
}

// 解析当前配置中的 RSS 源列表
function parseRssFeedsFromYaml() {
    try {
        const doc = jsyaml.load(currentYaml);
        if (doc && doc.rss && doc.rss.feeds) {
            return doc.rss.feeds;
        }
    } catch (e) {}
    return [];
}

// 渲染 RSS 源列表
function renderRssFeedsList() {
    const container = document.getElementById('rss-feeds-list');
    if (!container) return;

    const feeds = parseRssFeedsFromYaml();

    if (feeds.length === 0) {
        container.innerHTML = `<div class="text-xs text-gray-400 italic">暂无 RSS 源，请添加</div>`;
        return;
    }

    container.innerHTML = feeds.map((f, idx) => `
        <div class="rss-feed-item bg-gray-50 rounded-lg px-3 py-2 border border-gray-200 hover:border-blue-300 transition-colors" data-index="${idx}">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <i class="fa-solid fa-rss text-orange-400"></i>
                    <span class="text-xs font-medium text-gray-700 truncate">${f.name}</span>
                    <span class="text-[10px] text-gray-400">(${f.id})</span>
                    ${f.enabled === false ? '<span class="text-[9px] bg-gray-200 text-gray-500 px-1 rounded">已禁用</span>' : ''}
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="editRssFeed(${idx})" class="text-blue-400 hover:text-blue-600 text-xs px-1" title="编辑">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button onclick="toggleRssFeed(${idx})" class="text-gray-400 hover:text-gray-600 text-xs px-1" title="${f.enabled === false ? '启用' : '禁用'}">
                        <i class="fa-solid fa-${f.enabled === false ? 'eye' : 'eye-slash'}"></i>
                    </button>
                    <button onclick="removeRssFeed(${idx})" class="text-red-400 hover:text-red-600 text-xs px-1" title="删除">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="text-[10px] text-gray-400 mt-1 truncate" title="${f.url}">${f.url}</div>
        </div>
    `).join('');
}

// 删除 RSS 源
window.removeRssFeed = function(index) {
    const feeds = parseRssFeedsFromYaml();
    if (index < 0 || index >= feeds.length) return;

    const feedName = feeds[index].name;
    if (!confirm(`确定要删除 RSS 源 "${feedName}" 吗？`)) return;

    feeds.splice(index, 1);
    updateRssFeedsInYaml(feeds);
}

// 切换 RSS 源启用状态
window.toggleRssFeed = function(index) {
    const feeds = parseRssFeedsFromYaml();
    if (index < 0 || index >= feeds.length) return;

    feeds[index].enabled = feeds[index].enabled === false ? true : false;
    updateRssFeedsInYaml(feeds);
}

// 编辑 RSS 源
window.editRssFeed = function(index) {
    const feeds = parseRssFeedsFromYaml();
    if (index < 0 || index >= feeds.length) return;

    const feed = feeds[index];

    openRssModalWithData(feed, index);
}

// 更新 YAML 中的 RSS 配置（保留注释）
function updateRssFeedsInYaml(feeds) {
    const editor = document.getElementById('yaml-editor');
    let yaml = editor.value;
    const lines = yaml.split('\n');

    // 找到 rss.feeds 的位置
    let feedsStart = -1;
    let feedsEnd = -1;
    let inRss = false;
    let inFeeds = false;
    let lastDataLineIndex = -1; // 记录最后一个数据行的位置

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (line.match(/^rss:/)) {
            inRss = true;
            continue;
        }

        if (inRss && !inFeeds && trimmed.startsWith('feeds:')) {
            feedsStart = i + 1;
            inFeeds = true;
            continue;
        }

        if (inFeeds) {
            const indent = line.search(/\S/);

            // 如果是数据行（以 - 开头或是数据项的属性）
            if (trimmed.startsWith('-')) {
                lastDataLineIndex = i;
            } else if (trimmed && !trimmed.startsWith('#') && indent > 2) {
                // 数据项的属性行（如 name:, id:, url:）
                lastDataLineIndex = i;
            } else if (trimmed && !trimmed.startsWith('#') && indent <= 2 && indent >= 0) {
                // 遇到缩进更小的非注释行，说明离开了 feeds 区域
                feedsEnd = lastDataLineIndex + 1;
                break;
            }
        }

        // 检查是否进入下一个顶级模块
        if (inRss && line.match(/^[a-z_]+:/) && !line.match(/^rss:/)) {
            if (lastDataLineIndex >= 0) {
                feedsEnd = lastDataLineIndex + 1;
            } else {
                feedsEnd = i;
            }
            break;
        }
    }

    // 如果没有找到结束位置，使用最后一个数据行的下一行
    if (feedsEnd === -1) {
        feedsEnd = lastDataLineIndex >= 0 ? lastDataLineIndex + 1 : lines.length;
    }

    // 提取区域内的注释（保留在开头的注释）
    const regionLines = lines.slice(feedsStart, feedsEnd);
    const leadingComments = [];
    for (const line of regionLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
            leadingComments.push(line);
        } else if (trimmed.startsWith('-') || (trimmed && !trimmed.startsWith('#'))) {
            // 遇到第一个数据项，停止收集注释
            break;
        } else if (trimmed === '') {
            // 空行也保留
            leadingComments.push(line);
        }
    }

    // 构建新的 feeds 内容
    const indent = '    '; // 4 空格缩进
    const newFeedsLines = feeds.map(f => {
        let feedYaml = `${indent}- id: "${f.id}"\n${indent}  name: "${f.name}"\n${indent}  url: "${f.url}"`;
        if (f.enabled === false) {
            feedYaml += `\n${indent}  enabled: false`;
        }
        if (f.max_age_days !== undefined && f.max_age_days !== '') {
            feedYaml += `\n${indent}  max_age_days: ${f.max_age_days}`;
        }
        return feedYaml;
    }).join('\n\n');

    const beforeFeeds = lines.slice(0, feedsStart);
    const afterFeeds = lines.slice(feedsEnd);

    // 组合：前面内容 + 开头注释 + 新数据 + 空行 + 后面内容
    const newYaml = [
        ...beforeFeeds,
        ...(leadingComments.length > 0 ? leadingComments : []),
        newFeedsLines,
        '',
        ...afterFeeds
    ].join('\n');

    editor.value = newYaml;
    currentYaml = newYaml;
    updateBackdrop('yaml-editor', 'yaml-backdrop');
    debounceSaveConfig();
    renderRssFeedsList();
    renderStandaloneLists(); // 同步更新独立展示区的 RSS 选择列表
}

// 打开 RSS 添加/编辑弹窗
window.openRssModal = function() {
    openRssModalWithData(null, -1);
}

function openRssModalWithData(feed, editIndex) {
    const modal = document.getElementById('rss-modal');

    document.getElementById('rss-id').value = feed ? feed.id : '';
    document.getElementById('rss-name').value = feed ? feed.name : '';
    document.getElementById('rss-url').value = feed ? feed.url : '';
    document.getElementById('rss-max-age').value = feed && feed.max_age_days !== undefined ? feed.max_age_days : '';

    modal.dataset.editIndex = editIndex;

    const title = modal.querySelector('h3');
    if (title) {
        title.innerHTML = editIndex >= 0 ?
            '<i class="fa-solid fa-rss mr-2 text-orange-500"></i>编辑 RSS 源' :
            '<i class="fa-solid fa-rss mr-2 text-orange-500"></i>添加 RSS 源';
    }

    modal.classList.remove('hidden');
}

// 关闭 RSS 弹窗
window.closeRssModal = function() {
    const modal = document.getElementById('rss-modal');
    modal.classList.add('hidden');
    modal.dataset.editIndex = '-1';

    document.getElementById('rss-id').value = '';
    document.getElementById('rss-name').value = '';
    document.getElementById('rss-url').value = '';
    document.getElementById('rss-max-age').value = '';
}

// 确认添加/编辑 RSS
window.confirmAddRss = function() {
    const modal = document.getElementById('rss-modal');
    const editIndex = parseInt(modal.dataset.editIndex || '-1');

    const id = document.getElementById('rss-id').value.trim();
    const name = document.getElementById('rss-name').value.trim();
    const url = document.getElementById('rss-url').value.trim();
    const maxAge = document.getElementById('rss-max-age').value.trim();

    if (!id || !name || !url) {
        alert('请填写完整信息：ID、名称和 URL 都是必填项');
        return;
    }

    const feeds = parseRssFeedsFromYaml();

    const newFeed = { id, name, url };
    if (maxAge) {
        newFeed.max_age_days = parseInt(maxAge);
    }

    if (editIndex >= 0) {
        feeds[editIndex] = newFeed;
    } else {
        feeds.push(newFeed);
    }

    updateRssFeedsInYaml(feeds);
    closeRssModal();
}

// ==========================================
// 14. 独立展示区 (Standalone) 管理功能
// ==========================================

function parseStandaloneConfigFromYaml() {
    try {
        const doc = jsyaml.load(currentYaml);
        if (doc && doc.display && doc.display.standalone) {
            return {
                platforms: doc.display.standalone.platforms || [],
                rss_feeds: doc.display.standalone.rss_feeds || []
            };
        }
    } catch (e) {}
    return { platforms: [], rss_feeds: [] };
}

function renderStandaloneLists() {
    const platformsContainer = document.getElementById('standalone-platforms-list');
    const rssContainer = document.getElementById('standalone-rss-list');

    if (!platformsContainer || !rssContainer) return;

    const standaloneConfig = parseStandaloneConfigFromYaml();
    const availablePlatforms = parsePlatformsFromYaml();
    const availableRss = parseRssFeedsFromYaml();

    // Render Platforms
    if (availablePlatforms.length === 0) {
        platformsContainer.innerHTML = `<div class="col-span-2 text-xs text-gray-400 italic">暂无可用平台</div>`;
    } else {
        platformsContainer.innerHTML = availablePlatforms.map(p => {
            const isChecked = standaloneConfig.platforms.includes(p.id);
            return `
                <label class="flex items-center gap-2 p-1.5 rounded hover:bg-white transition-colors cursor-pointer">
                    <input type="checkbox" onchange="toggleStandaloneItem('platforms', '${p.id}')"
                           ${isChecked ? 'checked' : ''} class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                    <div class="min-w-0">
                        <div class="text-xs font-medium text-gray-700 truncate">${p.name}</div>
                        <div class="text-[9px] text-gray-400 truncate">${p.id}</div>
                    </div>
                </label>
            `;
        }).join('');
    }

    // Render RSS
    if (availableRss.length === 0) {
        rssContainer.innerHTML = `<div class="text-xs text-gray-400 italic">暂无可用 RSS 源</div>`;
    } else {
        rssContainer.innerHTML = availableRss.map(f => {
            const isChecked = standaloneConfig.rss_feeds.includes(f.id);
            return `
                <label class="flex items-center gap-2 p-1.5 rounded hover:bg-white transition-colors cursor-pointer">
                    <input type="checkbox" onchange="toggleStandaloneItem('rss_feeds', '${f.id}')"
                           ${isChecked ? 'checked' : ''} class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-medium text-gray-700 truncate">${f.name}</span>
                            <span class="text-[9px] text-gray-400 ml-2">${f.id}</span>
                        </div>
                        <div class="text-[9px] text-gray-400 truncate">${f.url}</div>
                    </div>
                </label>
            `;
        }).join('');
    }
}

window.toggleStandaloneItem = function(type, id) {
    const config = parseStandaloneConfigFromYaml();
    const list = config[type];

    const index = list.indexOf(id);
    if (index === -1) {
        list.push(id);
    } else {
        list.splice(index, 1);
    }

    updateStandaloneConfigInYaml(type, list);
}

function updateStandaloneConfigInYaml(type, list) {
    const editor = document.getElementById('yaml-editor');
    let yaml = editor.value;
    const lines = yaml.split('\n');

    // 找到 display -> standalone -> [type]
    let inDisplay = false;
    let inStandalone = false;
    let targetLineIndex = -1;
    let indent = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^display:/)) {
            inDisplay = true;
            continue;
        }
        if (inDisplay && line.trim().startsWith('standalone:')) {
            inStandalone = true;
            continue;
        }
        if (inStandalone) {
            // 检查是否离开 standalone (遇到缩进更少或相同的非注释行)
            const currentIndent = line.search(/\S/);
            // standalone 下一级的缩进
            if (line.match(new RegExp(`^\\s*${type}:`))) {
                targetLineIndex = i;
                indent = line.substring(0, line.indexOf(type));
                break;
            }
            // 如果遇到下一个模块，停止
            if (line.match(/^[a-z_]+:/) && !line.match(/^display:/)) break;
        }
    }

    if (targetLineIndex !== -1) {
        // 构建新的数组字符串 ["item1", "item2"]
        const jsonStr = JSON.stringify(list);
        // 保留原有注释
        const originalLine = lines[targetLineIndex];
        const commentMatch = originalLine.match(/#.*$/);
        const comment = commentMatch ? commentMatch[0] : '';

        lines[targetLineIndex] = `${indent}${type}: ${jsonStr}${comment ? ' ' + comment : ''}`;

        const newYaml = lines.join('\n');
        editor.value = newYaml;
        currentYaml = newYaml;
        updateBackdrop('yaml-editor', 'yaml-backdrop');
        debounceSaveConfig();

        // 不需要重新渲染整个列表，因为是 checkbox 点击触发的
        // 但如果需要保持一致性，可以重新渲染
    }
}


// 从文本中提取版本号
function extractVersion(text) {
    // 匹配 Version: v5.3.0 或 Version: 5.3.0 格式
    const versionMatch = text.match(/Version:\s*v?(\d+\.\d+\.\d+)/i);
    if (versionMatch) {
        return versionMatch[1]; // 返回不带 v 的版本号
    }
    return null;
}

// 比较版本号 (返回 1: v1 > v2, -1: v1 < v2, 0: v1 == v2)
function compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;

    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;

        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }

    return 0;
}

// 版本检测主函数
window.checkVersion = async function() {
    const btn = document.getElementById('version-check-btn');
    const originalHTML = btn.innerHTML;

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>检测中...</span>';
    btn.disabled = true;

    try {
        const versionRes = await fetch(REMOTE_VERSION_URL);
        if (!versionRes.ok) {
            throw new Error(`版本信息获取失败: ${versionRes.status}`);
        }

        const versionConfigText = await versionRes.text();
        const versionMap = {};
        versionConfigText.split('\n').forEach(line => {
            const parts = line.trim().split('=');
            if (parts.length >= 2) {
                versionMap[parts[0].trim()] = parts[1].trim();
            }
        });

        const currentTab = getCurrentTab();
        let currentVersion = null;
        let fileName = '';

        if (currentTab === 'config') {
            currentVersion = extractVersion(currentYaml);
            fileName = 'config.yaml';
        } else {
            currentVersion = extractVersion(currentFrequency);
            fileName = 'frequency_words.txt';
        }

        const latestVersion = versionMap[fileName];

        if (!latestVersion) {
             throw new Error(`未在远程版本清单中找到 ${fileName}`);
        }

        showVersionComparisonModal(fileName, currentVersion, latestVersion);

    } catch (err) {
        console.error('版本检测失败:', err);
        showToast(`版本检测失败: ${err.message}`, 'error');
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

// 获取当前 Tab
function getCurrentTab() {
    return currentTab; 
}

// 显示版本对比弹窗
function showVersionComparisonModal(fileName, currentVersion, latestVersion) {
    const existingModal = document.getElementById('version-comparison-modal');
    if (existingModal) existingModal.remove();

    const comparison = compareVersions(currentVersion, latestVersion);
    let statusIcon = '';
    let statusText = '';
    let statusColor = '';
    let actionButtons = '';

    if (!currentVersion) {
        statusIcon = '<i class="fa-solid fa-question-circle text-gray-500 text-3xl"></i>';
        statusText = '未检测到版本信息';
        statusColor = 'text-gray-600';
        actionButtons = `
            <button onclick="closeVersionModal()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">关闭</button>
            <button onclick="updateToLatest()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <i class="fa-solid fa-download mr-1"></i>更新到最新版本
            </button>
        `;
    } else if (comparison < 0) {
        statusIcon = '<i class="fa-solid fa-arrow-up text-orange-500 text-3xl"></i>';
        statusText = '发现新版本';
        statusColor = 'text-orange-600';
        actionButtons = `
            <button onclick="closeVersionModal()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">稍后更新</button>
            <button onclick="updateToLatest()" class="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                <i class="fa-solid fa-download mr-1"></i>立即更新
            </button>
        `;
    } else if (comparison > 0) {
        statusIcon = '<i class="fa-solid fa-flask text-purple-500 text-3xl"></i>';
        statusText = '当前版本较新（开发版本？）';
        statusColor = 'text-purple-600';
        actionButtons = `
            <button onclick="closeVersionModal()" class="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg">关闭</button>
        `;
    } else {
        statusIcon = '<i class="fa-solid fa-check-circle text-green-500 text-3xl"></i>';
        statusText = '已是最新版本';
        statusColor = 'text-green-600';
        actionButtons = `
            <button onclick="closeVersionModal()" class="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg">关闭</button>
        `;
    }

    const modal = document.createElement('div');
    modal.id = 'version-comparison-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 480px;">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold text-gray-800">
                    <i class="fa-solid fa-code-compare mr-2 text-blue-500"></i>版本检测结果
                </h3>
                <button onclick="closeVersionModal()" class="text-gray-400 hover:text-gray-600">
                    <i class="fa-solid fa-times text-xl"></i>
                </button>
            </div>

            <div class="text-center py-6">
                ${statusIcon}
                <div class="text-xl font-bold ${statusColor} mt-3">${statusText}</div>
            </div>

            <div class="bg-gray-50 rounded-lg p-4 space-y-3 mb-4">
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">配置文件</span>
                    <span class="font-mono font-bold text-gray-800">${fileName}</span>
                </div>
                <div class="border-t border-gray-200"></div>
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">当前版本</span>
                    <span class="font-mono font-bold ${currentVersion ? 'text-blue-600' : 'text-gray-400'}">
                        ${currentVersion ? 'v' + currentVersion : '未知'}
                    </span>
                </div>
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">最新版本</span>
                    <span class="font-mono font-bold text-green-600">v${latestVersion}</span>
                </div>
            </div>

            ${comparison < 0 || !currentVersion ? `
                <div class="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                    <i class="fa-solid fa-lightbulb mr-1 text-yellow-600"></i>
                    <strong>提示：</strong>更新将从 GitHub 加载最新的 ${fileName}，你当前的修改将被覆盖。建议先复制保存你的自定义配置。
                </div>
            ` : ''}

            <div class="flex justify-end gap-2">
                ${actionButtons}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

window.closeVersionModal = function() {
    const modal = document.getElementById('version-comparison-modal');
    if (modal) modal.remove();
}

// ==========================================
// 13. 平台添加弹窗逻辑
// ==========================================

// 预定义可用平台列表 (仅包含官方默认支持的平台)
const PRESET_PLATFORMS = [
    { key: 'toutiao', name: '今日头条' },
    { key: 'baidu', name: '百度热搜' },
    { key: 'wallstreetcn-hot', name: '华尔街见闻' },
    { key: 'thepaper', name: '澎湃新闻' },
    { key: 'bilibili-hot-search', name: 'bilibili 热搜' },
    { key: 'cls-hot', name: '财联社热门' },
    { key: 'ifeng', name: '凤凰网' },
    { key: 'tieba', name: '贴吧' },
    { key: 'weibo', name: '微博' },
    { key: 'douyin', name: '抖音' },
    { key: 'zhihu', name: '知乎' }
];

/**
 * 打开平台添加弹窗
 */
window.openPlatformModal = function() {
    const modal = document.getElementById('platform-modal');
    if (modal) {
        modal.classList.remove('hidden');
        if (typeof switchPlatformTab === 'function') {
            switchPlatformTab('select');
        }
        renderAvailablePlatforms();
    }
}

/**
 * 关闭平台添加弹窗
 */
window.closePlatformModal = function() {
    const modal = document.getElementById('platform-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * 切换平台添加标签页
 */
window.switchPlatformTab = function(tab) {
    currentPlatformTab = tab;

    // 更新 Tab 样式
    const tabSelect = document.getElementById('tab-platform-select');
    const tabCustom = document.getElementById('tab-platform-custom');

    if (tab === 'select') {
        if (tabSelect) {
            tabSelect.classList.add('text-blue-600', 'border-blue-600');
            tabSelect.classList.remove('text-gray-500', 'border-transparent');
        }
        if (tabCustom) {
            tabCustom.classList.remove('text-blue-600', 'border-blue-600');
            tabCustom.classList.add('text-gray-500', 'border-transparent');
        }

        const selectPanel = document.getElementById('platform-select-panel');
        const customPanel = document.getElementById('platform-custom-panel');
        if (selectPanel) selectPanel.classList.remove('hidden');
        if (customPanel) customPanel.classList.add('hidden');
    } else {
        if (tabCustom) {
            tabCustom.classList.add('text-blue-600', 'border-blue-600');
            tabCustom.classList.remove('text-gray-500', 'border-transparent');
        }
        if (tabSelect) {
            tabSelect.classList.remove('text-blue-600', 'border-blue-600');
            tabSelect.classList.add('text-gray-500', 'border-transparent');
        }

        const selectPanel = document.getElementById('platform-select-panel');
        const customPanel = document.getElementById('platform-custom-panel');
        if (selectPanel) selectPanel.classList.add('hidden');
        if (customPanel) customPanel.classList.remove('hidden');
    }
}

/**
 * 渲染可用平台列表（排除已添加的）
 */
function renderAvailablePlatforms() {
    const container = document.getElementById('available-platforms-list');
    const tip = document.getElementById('no-platforms-tip');
    if (!container) return;
    container.innerHTML = '';

    const currentPlatforms = parsePlatformsFromYaml();
    const existingKeys = currentPlatforms.map(p => p.id); 

    const available = PRESET_PLATFORMS.filter(p => !existingKeys.includes(p.key));

    if (available.length === 0) {
        if (tip) {
            tip.classList.remove('hidden');
            tip.innerHTML = `<i class="fa-solid fa-check-circle text-green-500 mr-2"></i>所有预设平台已添加`;
        }
    } else {
        if (tip) tip.classList.add('hidden');

        available.forEach(p => {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between p-3 border border-gray-100 rounded hover:bg-blue-50 cursor-pointer transition-colors group';
            div.onclick = () => confirmAddPlatform(p.key, p.name);
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-500 group-hover:bg-white group-hover:text-blue-600">
                        <i class="fa-solid fa-cube"></i>
                    </div>
                    <div>
                        <div class="font-bold text-gray-800 text-sm">${p.name}</div>
                        <div class="text-xs text-gray-400 font-mono">${p.key}</div>
                    </div>
                </div>
                <button class="text-gray-300 group-hover:text-blue-600">
                    <i class="fa-solid fa-plus-circle text-lg"></i>
                </button>
            `;
            container.appendChild(div);
        });
    }
}

/**
 * 确认添加平台
 */
window.confirmAddPlatform = function(key, name) {
    let platformKey = key;
    let platformName = name;

    // 如果是手动输入模式 (且未传入 key)
    if (currentPlatformTab === 'custom' && !key) {
        const keyInput = document.getElementById('custom-platform-key');
        const nameInput = document.getElementById('custom-platform-name');

        if (keyInput) platformKey = keyInput.value.trim();
        if (nameInput) platformName = nameInput.value.trim();

        if (!platformKey) {
            alert('请输入平台 Key');
            return;
        }
        if (!platformName) {
            platformName = platformKey;
        }
    } else if (currentPlatformTab === 'select' && !key) {
        alert('请直接点击上方列表中的平台进行添加');
        return;
    }

    // 检查是否已存在
    const currentPlatforms = parsePlatformsFromYaml();
    if (currentPlatforms.find(p => p.id === platformKey)) {
        alert(`平台 ${platformKey} 已存在！`);
        return;
    }

    // 添加到 YAML (注意字段是 id 和 name)
    const newPlatform = {
        id: platformKey,
        name: platformName,
        enabled: true
    };

    // 重新构建 YAML
    currentPlatforms.push(newPlatform);
    updatePlatformsInYaml(currentPlatforms);

    closePlatformModal();

    const keyInput = document.getElementById('custom-platform-key');
    const nameInput = document.getElementById('custom-platform-name');
    if (keyInput) keyInput.value = '';
    if (nameInput) nameInput.value = '';

    renderPlatformsList();

    showToast(`平台 ${platformName} 已添加`, 'success');
}

// 绑定到全局
window.updateToLatest = async function() {
    closeVersionModal();

    const currentTab = getCurrentTab();
    const fileName = currentTab === 'config' ? 'config.yaml' : 'frequency_words.txt';

    if (!confirm(`确定要从 GitHub 更新 ${fileName} 到最新版本吗？\n\n你当前的自定义配置将被覆盖，建议先复制保存。`)) {
        return;
    }

    showToast('正在从 GitHub 加载最新版本...', 'info');

    try {
        const url = currentTab === 'config' ? REMOTE_CONFIG_URL : REMOTE_FREQUENCY_URL;
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`加载失败: ${res.status}`);
        }

        const text = await res.text();

        if (currentTab === 'config') {
            try {
                jsyaml.load(text);
            } catch (yamlErr) {
                showToast(`YAML 语法错误: ${yamlErr.message}`, 'error');
                return;
            }
            document.getElementById('yaml-editor').value = text;
            currentYaml = text;
            syncYamlToUI();
        } else {
            document.getElementById('frequency-editor').value = text;
            currentFrequency = text;
            syncFrequencyToUI();
        }

        saveToLocalStorage();

        showToast(`已更新到最新版本`, 'success');

    } catch (err) {
        console.error('更新失败:', err);
        showToast(`更新失败: ${err.message}`, 'error');
    }
}

// ==========================================
// RSS 辅助功能
// ==========================================

function toggleRssTips() {
    const panel = document.getElementById('rss-tips-panel');
    const icon = document.getElementById('rss-tips-icon');
    if (panel) {
        panel.classList.toggle('hidden');
        if (icon) {
            icon.style.transform = panel.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    }
}

function fillRssUrl(url) {
    const input = document.getElementById('rss-url');
    if (input) {
        input.value = url;
        // 视觉反馈
        input.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
        setTimeout(() => {
            input.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50');
        }, 500);
    }
}
