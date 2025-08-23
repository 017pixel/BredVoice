document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENT SELECTORS ---
    const appContainer = document.getElementById('app-container');
    const voiceTabBtn = document.getElementById('voice-tab-btn');
    const todoTabBtn = document.getElementById('todo-tab-btn');
    const tabIndicator = document.querySelector('.tab-indicator');
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');

    const voiceModeView = document.getElementById('voice-mode');
    const todoModeView = document.getElementById('todo-mode');
    const settingsOverlay = document.getElementById('settings-overlay');

    const taskList = document.getElementById('task-list');
    const addTaskForm = document.getElementById('add-task-form');
    const taskInput = document.getElementById('task-input');
    
    const voiceVisualizer = document.getElementById('voice-visualizer');
    const responseBox = document.getElementById('response-box');
    const responseContent = document.getElementById('response-content');
    const placeholderText = document.querySelector('#response-box .placeholder');

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const saveConfirmation = document.getElementById('save-confirmation');
    const apiKeyInputs = document.querySelectorAll('.api-key-input');
    const personalizationPromptInput = document.getElementById('personalization-prompt');
    const ttsEnabledCheckbox = document.getElementById('tts-enabled');
    const ttsVoiceSelect = document.getElementById('tts-voice');

    // --- STATE ---
    let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
    let db;
    let isListening = false;
    let recognition;
    let currentApiKeyIndex = 0;

    // --- SPEECH RECOGNITION SETUP ---
    function initSpeechRecognition() {
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) {
            console.error("Speech Recognition not supported by this browser.");
            placeholderText.textContent = "Spracherkennung nicht unterstützt.";
            responseBox.style.cursor = 'default';
            return;
        }
        recognition = new SpeechRecognition();
        recognition.lang = 'de-DE';
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.onstart = () => setListeningState(true);
        recognition.onresult = (event) => processVoiceInput(event.results[0][0].transcript);
        recognition.onend = () => setListeningState(false);
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            displayResponse("Entschuldigung, ich habe das nicht verstanden.");
        };
    }

    // --- DATABASE (IndexedDB) ---
    function initDB() {
        const request = indexedDB.open('BredVoiceDB', 1);
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
            }
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            loadSettings();
        };
        request.onerror = (event) => console.error('IndexedDB error:', event.target.errorCode);
    }

    // --- SETTINGS (API Key Rotation Logic) ---
    function saveSettings() {
        if (!db) return;
        const transaction = db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        const apiKeys = Array.from(apiKeyInputs).map(input => input.value);
        const settings = {
            id: 'userSettings',
            apiKeys: apiKeys,
            personalizationPrompt: personalizationPromptInput.value,
            ttsEnabled: ttsEnabledCheckbox.checked,
            ttsVoice: ttsVoiceSelect.value
        };
        store.put(settings);
        saveConfirmation.classList.add('show');
        setTimeout(() => saveConfirmation.classList.remove('show'), 2000);
    }

    function loadSettings() {
        if (!db) return;
        const transaction = db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get('userSettings');
        request.onsuccess = () => {
            if (request.result) {
                const savedKeys = request.result.apiKeys || [];
                apiKeyInputs.forEach((input, index) => {
                    input.value = savedKeys[index] || '';
                });
                personalizationPromptInput.value = request.result.personalizationPrompt || '';
                ttsEnabledCheckbox.checked = request.result.ttsEnabled || false;
                populateVoiceList().then(() => {
                    ttsVoiceSelect.value = request.result.ttsVoice || '';
                    ttsVoiceSelect.disabled = !ttsEnabledCheckbox.checked;
                });
            } else {
                populateVoiceList();
            }
        };
    }

    function populateVoiceList() {
        return new Promise(resolve => {
            const synth = window.speechSynthesis;
            const setVoices = () => {
                const voices = synth.getVoices();
                if (voices.length) {
                    ttsVoiceSelect.innerHTML = '';
                    voices.filter(v => v.lang.startsWith('de')).forEach(voice => {
                        const option = document.createElement('option');
                        option.textContent = `${voice.name} (${voice.lang})`;
                        option.value = voice.name;
                        ttsVoiceSelect.appendChild(option);
                    });
                    resolve();
                }
            };
            if (synth.getVoices().length) setVoices();
            else synth.onvoiceschanged = setVoices;
        });
    }

    // --- NAVIGATION ---
    function updateTabIndicator(activeButton) {
        const { offsetLeft, offsetWidth } = activeButton;
        tabIndicator.style.width = `${offsetWidth}px`;
        tabIndicator.style.transform = `translateX(${offsetLeft}px)`;
    }
    
    function switchView(activeView) {
        document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.tab-btn.active').forEach(b => b.classList.remove('active'));
        let activeButton;
        if (activeView === 'voice') {
            voiceModeView.classList.add('active');
            voiceTabBtn.classList.add('active');
            activeButton = voiceTabBtn;
        } else {
            todoModeView.classList.add('active');
            todoTabBtn.classList.add('active');
            activeButton = todoTabBtn;
        }
        updateTabIndicator(activeButton);
    }

    // --- TODO LOGIC ---
    function saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    function renderTasks() {
        taskList.innerHTML = '';
        if (tasks.length === 0) {
            taskList.innerHTML = `<li class="empty-state"><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><h3>Alles erledigt!</h3><p>Füge eine neue Aufgabe hinzu, um loszulegen.</p></li>`;
            return;
        }
        tasks.forEach(task => taskList.appendChild(createTaskElement(task)));
    }

    function addTask(text, label = null) {
        if (!text) return;
        const newTask = { id: Date.now(), text: text.trim(), label, completed: false };
        tasks.unshift(newTask);
        saveTasks();
        if (taskList.querySelector('.empty-state')) taskList.innerHTML = '';
        const taskItem = createTaskElement(newTask);
        taskItem.classList.add('slide-in');
        taskList.prepend(taskItem);
    }
    
    function createTaskElement(task) {
        const item = document.createElement('li');
        item.className = `task-item ${task.completed ? 'completed' : ''}`;
        item.dataset.id = task.id;
        const labelHtml = task.label ? `<span class="task-label ${task.label}">${task.label}</span>` : '';
        item.innerHTML = `<div class="task-content"><input type="checkbox" ${task.completed ? 'checked' : ''}><div class="task-details"><span class="task-text">${task.text}</span>${labelHtml}</div></div><button class="delete-task-btn" aria-label="Aufgabe löschen"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`;
        return item;
    }

    // --- VOICE LOGIC & AI CORE ---
    function setListeningState(isListeningNow) {
        isListening = isListeningNow;
        voiceVisualizer.classList.toggle('active', isListening);
        responseContent.innerHTML = '';
        placeholderText.style.display = 'block';
        placeholderText.textContent = isListening ? 'Ich höre zu...' : 'Klicke zum sprechen';
    }

    function displayResponse(text) {
        placeholderText.style.display = 'none';
        const p = document.createElement('p');
        p.textContent = text;
        responseContent.innerHTML = '';
        responseContent.appendChild(p);
    }

    function speakText(text) {
        if (!ttsEnabledCheckbox.checked || !text) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const selectedVoice = window.speechSynthesis.getVoices().find(v => v.name === ttsVoiceSelect.value);
        if (selectedVoice) utterance.voice = selectedVoice;
        window.speechSynthesis.speak(utterance);
    }

    async function processInputWithAI(prompt) {
        const validApiKeys = Array.from(apiKeyInputs).map(input => input.value).filter(key => key.trim() !== '');
        if (validApiKeys.length === 0) {
            return { type: 'error', content: "Bitte hinterlege zuerst mindestens einen API-Schlüssel in den Einstellungen." };
        }
        
        const apiKey = validApiKeys[currentApiKeyIndex];
        currentApiKeyIndex = (currentApiKeyIndex + 1) % validApiKeys.length;

        const modelName = 'gemini-2.0-flash';
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const basePrompt = `Du bist BredVoice, ein persönlicher Assistent. Deine Aufgabe ist es, die Eingabe des Users zu analysieren und zu entscheiden, ob sie eine oder mehrere Aufgaben für eine To-Do-Liste enthält oder eine allgemeine Anfrage ist. Erkenne Aufzählungen (z.B. mit 'und', Kommas). Antworte IMMER NUR mit einem JSON-Objekt.

        Struktur des JSON-Objekts:
        {
          "type": "'task' oder 'query'",
          "tasks": ["Ein Array mit allen extrahierten, prägnanten Aufgabentiteln. Bleibt leer, wenn type = 'query'."],
          "content": "Deine Antwort oder Bestätigungsnachricht an den User."
        }
        
        Beispiel 1 (Mehrere Aufgaben): User sagt "Ich muss heute noch die Wäsche waschen und danach das Bad putzen."
        Deine Antwort: {"type": "task", "tasks": ["Wäsche waschen", "Bad putzen"], "content": "Alles klar, ich habe 2 Aufgaben notiert."}
        
        Beispiel 2 (Einzelne Aufgabe): User sagt "Erinnere mich daran, den Müll rauszubringen."
        Deine Antwort: {"type": "task", "tasks": ["Müll rausbringen"], "content": "Ich habe 'Müll rausbringen' zu deinen Aufgaben hinzugefügt."}

        Beispiel 3 (Allgemeine Frage): User sagt "Wie wird das Wetter morgen?"
        Deine Antwort: {"type": "query", "tasks": [], "content": "Das Wetter morgen wird sonnig mit Temperaturen bis zu 25 Grad."}`;

        const personalization = personalizationPromptInput.value;
        const todoListContext = tasks.length > 0 ? `AKTUELLE TO-DO-LISTE DES USERS:\n${tasks.map(t => `- ${t.text} (${t.completed ? 'erledigt' : 'offen'})`).join('\n')}` : "Die To-Do-Liste des Users ist aktuell leer.";
        
        const fullPrompt = `${basePrompt}\n\n${personalization}\n\n${todoListContext}\n\nUser-Eingabe: "${prompt}"`;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }], generationConfig: { responseMimeType: "application/json" } })
            });
            if (!response.ok) {
                if (response.status === 429) return { type: 'error', content: "API-Anfragelimit erreicht. Bitte warte einen Moment oder füge mehr Schlüssel hinzu." };
                const errorData = await response.json();
                return { type: 'error', content: `API Fehler: ${errorData.error.message}` };
            }
            const data = await response.json();
            const aiResponseText = data.candidates[0].content.parts[0].text;
            return JSON.parse(aiResponseText);
        } catch (error) {
            console.error("AI Processing Error:", error);
            return { type: 'error', content: "Ein Fehler ist aufgetreten. Die Antwort der KI konnte nicht verarbeitet werden." };
        }
    }

    async function processVoiceInput(transcript) {
        displayResponse(`Ich verarbeite: "${transcript}"`);
        
        const aiResponse = await processInputWithAI(transcript);
        let responseText;

        switch (aiResponse.type) {
            case 'task':
                if (aiResponse.tasks && aiResponse.tasks.length > 0) {
                    aiResponse.tasks.forEach(taskTitle => {
                        addTask(taskTitle);
                    });
                    // Use the AI-generated confirmation message
                    responseText = aiResponse.content || `Ich habe ${aiResponse.tasks.length} Aufgaben hinzugefügt.`;
                    setTimeout(() => switchView('todo'), 1500);
                } else {
                    // Fallback if AI says it's a task but provides no titles
                    responseText = "Ich sollte eine Aufgabe hinzufügen, konnte aber keine spezifischen Aufgaben identifizieren.";
                }
                break;
            case 'query':
                responseText = aiResponse.content;
                break;
            case 'error':
                responseText = aiResponse.content;
                break;
            default:
                responseText = "Entschuldigung, es ist ein unerwarteter Fehler aufgetreten.";
        }

        displayResponse(responseText);
        speakText(responseText);
    }

    // --- EVENT LISTENERS ---
    voiceTabBtn.addEventListener('click', () => switchView('voice'));
    todoTabBtn.addEventListener('click', () => switchView('todo'));
    settingsBtn.addEventListener('click', () => settingsOverlay.classList.add('active'));
    closeSettingsBtn.addEventListener('click', () => settingsOverlay.classList.remove('active'));
    saveSettingsBtn.addEventListener('click', saveSettings);
    ttsEnabledCheckbox.addEventListener('change', () => ttsVoiceSelect.disabled = !ttsEnabledCheckbox.checked);
    addTaskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        addTask(taskInput.value);
        taskInput.value = '';
    });
    taskList.addEventListener('click', (e) => {
        const taskItem = e.target.closest('.task-item');
        if (!taskItem) return;
        const id = taskItem.dataset.id;
        if (e.target.matches('input[type="checkbox"]')) {
            const task = tasks.find(t => t.id == id);
            if (task) {
                task.completed = !task.completed;
                saveTasks();
                taskItem.classList.toggle('completed');
            }
        }
        if (e.target.closest('.delete-task-btn')) {
             const taskItem = e.target.closest('.task-item');
             if (taskItem) {
                 taskItem.classList.add('slide-out');
                 taskItem.addEventListener('animationend', () => {
                     tasks = tasks.filter(t => t.id != id);
                     saveTasks();
                     taskItem.remove();
                     if (tasks.length === 0) renderTasks();
                 }, { once: true });
             }
        }
    });
    responseBox.addEventListener('click', () => {
        if (!isListening && recognition) {
            window.speechSynthesis.cancel();
            recognition.start();
        }
    });

    // --- INITIALIZATION ---
    function init() {
        initDB();
        initSpeechRecognition();
        switchView('voice');
        renderTasks();
        setListeningState(false);
    }



    init();
});