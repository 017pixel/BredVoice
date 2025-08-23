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

    // Settings selectors
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const saveConfirmation = document.getElementById('save-confirmation');
    const apiKeyInputs = document.querySelectorAll('.api-key-input');
    const personalizationPromptInput = document.getElementById('personalization-prompt');
    const ttsEnabledCheckbox = document.getElementById('tts-enabled');
    const ttsVoiceSelect = document.getElementById('tts-voice');
    const ttsRateSlider = document.getElementById('tts-rate');
    const ttsRateValue = document.getElementById('tts-rate-value');
    const ttsPitchSlider = document.getElementById('tts-pitch');
    const ttsPitchValue = document.getElementById('tts-pitch-value');
    const apiKeyGroup = document.getElementById('api-key-group');

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

    // --- SETTINGS ---
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
            ttsVoice: ttsVoiceSelect.value,
            ttsRate: ttsRateSlider.value,
            ttsPitch: ttsPitchSlider.value
        };
        store.put(settings);
        
        saveConfirmation.classList.add('show');
        setTimeout(() => saveConfirmation.classList.remove('show'), 1500);
        setTimeout(() => settingsOverlay.classList.remove('active'), 1500);
    }

    function loadSettings() {
        if (!db) return;
        const transaction = db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get('userSettings');
        request.onsuccess = () => {
            if (request.result) {
                const settings = request.result;
                const savedKeys = settings.apiKeys || [];
                apiKeyInputs.forEach((input, index) => {
                    input.value = savedKeys[index] || '';
                });
                personalizationPromptInput.value = settings.personalizationPrompt || '';
                ttsEnabledCheckbox.checked = settings.ttsEnabled || false;
                
                ttsRateSlider.value = settings.ttsRate || 1;
                ttsRateValue.textContent = parseFloat(ttsRateSlider.value).toFixed(1);
                ttsPitchSlider.value = settings.ttsPitch || 1;
                ttsPitchValue.textContent = parseFloat(ttsPitchSlider.value).toFixed(1);

                populateVoiceList().then(() => {
                    ttsVoiceSelect.value = settings.ttsVoice || '';
                    ttsVoiceSelect.disabled = !ttsEnabledCheckbox.checked;
                });
            } else {
                populateVoiceList();
            }
            // Trigger textarea resize on load
            personalizationPromptInput.dispatchEvent(new Event('input'));
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

    function findTaskByText(text) {
        if (!text) return null;
        const normalizedText = text.trim().toLowerCase();
        return tasks.find(t => t.text.trim().toLowerCase() === normalizedText);
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
        utterance.rate = parseFloat(ttsRateSlider.value);
        utterance.pitch = parseFloat(ttsPitchSlider.value);
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

        const basePrompt = `Du bist BredVoice, ein persönlicher Assistent. Deine Aufgabe ist es, die Eingabe des Users zu analysieren und eine Aktion für eine To-Do-Liste zu bestimmen oder eine allgemeine Anfrage zu beantworten. Antworte IMMER NUR mit einem JSON-Objekt.

        Mögliche Aktionstypen: 'task' (hinzufügen), 'complete_task', 'delete_task', 'edit_task', 'query' (allgemeine Anfrage).
        
        Struktur des JSON-Objekts:
        {
          "type": "aktionstyp",
          "tasks": ["Array mit Aufgabentiteln (nur bei 'task')"],
          "target_task": "Name der Zielaufgabe (bei 'complete', 'delete', 'edit')",
          "new_content": "Neuer Text der Aufgabe (nur bei 'edit')",
          "content": "Deine Antwort/Bestätigung an den User."
        }

        **Szenarien:**

        1.  **Aufgabe(n) hinzufügen ('task'):**
            *   User: "Füge Milch kaufen und Wäsche waschen zu meiner Liste hinzu."
            *   Antwort: {"type": "task", "tasks": ["Milch kaufen", "Wäsche waschen"], "content": "Klar, ich habe 2 Aufgaben hinzugefügt."}

        2.  **Aufgabe erledigen ('complete_task'):**
            *   User: "Ich habe die Wäsche gewaschen." oder "Markiere 'Wäsche waschen' als erledigt."
            *   Antwort: {"type": "complete_task", "target_task": "Wäsche waschen", "content": "Super, ich habe 'Wäsche waschen' als erledigt markiert."}

        3.  **Aufgabe löschen ('delete_task'):**
            *   User: "Entferne 'Milch kaufen' von der Liste."
            *   Antwort: {"type": "delete_task", "target_task": "Milch kaufen", "content": "Okay, 'Milch kaufen' wurde entfernt."}

        4.  **Aufgabe bearbeiten ('edit_task'):**
            *   User: "Ändere 'Auto waschen' zu 'Auto waschen und aussaugen'."
            *   Antwort: {"type": "edit_task", "target_task": "Auto waschen", "new_content": "Auto waschen und aussaugen", "content": "Verstanden, ich habe die Aufgabe aktualisiert."}

        5.  **Allgemeine Anfrage ('query'):**
            *   User: "Wie hoch ist der Mount Everest?"
            *   Antwort: {"type": "query", "content": "Der Mount Everest ist 8848 Meter hoch."}

        **WICHTIG:** Bei Aktionen, die eine Aufgabe betreffen ('complete', 'delete', 'edit'), musst du den 'target_task' so exakt wie möglich aus der aktuellen To-Do-Liste des Users ableiten. Wenn du nicht sicher bist, welche Aufgabe gemeint ist, frage nach.
        *   User: "Lösche die Aufgabe." (Wenn mehrere Aufgaben existieren)
        *   Antwort: {"type": "query", "content": "Ich bin nicht sicher, welche Aufgabe du meinst. Kannst du sie genauer beschreiben?"}`;

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
        let responseText = aiResponse.content || "Etwas ist schiefgelaufen.";

        switch (aiResponse.type) {
            case 'task':
                if (aiResponse.tasks && aiResponse.tasks.length > 0) {
                    aiResponse.tasks.forEach(taskTitle => addTask(taskTitle));
                    responseText = aiResponse.content || `Ich habe ${aiResponse.tasks.length} Aufgaben hinzugefügt.`;
                    setTimeout(() => switchView('todo'), 1500);
                } else {
                    responseText = "Ich konnte keine spezifischen Aufgaben zum Hinzufügen identifizieren.";
                }
                break;

            case 'complete_task': {
                const task = findTaskByText(aiResponse.target_task);
                if (task) {
                    task.completed = true;
                    saveTasks();
                    const taskItem = taskList.querySelector(`.task-item[data-id="${task.id}"]`);
                    if (taskItem) {
                        taskItem.classList.add('completed');
                        taskItem.querySelector('input[type="checkbox"]').checked = true;
                    }
                } else {
                    responseText = `Ich konnte die Aufgabe "${aiResponse.target_task}" nicht finden.`;
                }
                break;
            }

            case 'delete_task': {
                const task = findTaskByText(aiResponse.target_task);
                if (task) {
                    const taskItem = taskList.querySelector(`.task-item[data-id="${task.id}"]`);
                    if (taskItem) {
                        taskItem.classList.add('slide-out');
                        taskItem.addEventListener('animationend', () => {
                            tasks = tasks.filter(t => t.id !== task.id);
                            saveTasks();
                            taskItem.remove();
                            if (tasks.length === 0) renderTasks();
                        }, { once: true });
                    }
                } else {
                    responseText = `Ich konnte die Aufgabe "${aiResponse.target_task}" nicht finden.`;
                }
                break;
            }

            case 'edit_task': {
                const task = findTaskByText(aiResponse.target_task);
                if (task && aiResponse.new_content) {
                    task.text = aiResponse.new_content;
                    saveTasks();
                    const taskItem = taskList.querySelector(`.task-item[data-id="${task.id}"] .task-text`);
                    if (taskItem) {
                        taskItem.textContent = aiResponse.new_content;
                    }
                } else {
                    responseText = `Ich konnte die Aufgabe "${aiResponse.target_task}" nicht bearbeiten.`;
                }
                break;
            }

            case 'query':
                // responseText is already set
                break;

            case 'error':
                // responseText is already set
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
    
    // Settings Listeners
    ttsEnabledCheckbox.addEventListener('change', () => ttsVoiceSelect.disabled = !ttsEnabledCheckbox.checked);
    ttsRateSlider.addEventListener('input', () => ttsRateValue.textContent = parseFloat(ttsRateSlider.value).toFixed(1));
    ttsPitchSlider.addEventListener('input', () => ttsPitchValue.textContent = parseFloat(ttsPitchSlider.value).toFixed(1));
    apiKeyGroup.querySelector('legend').addEventListener('click', () => apiKeyGroup.classList.toggle('collapsed'));
    personalizationPromptInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Task Listeners
    addTaskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        addTask(taskInput.value);
        taskInput.value = '';
    });
    taskList.addEventListener('click', (e) => {
        const taskItem = e.target.closest('.task-item');
        if (!taskItem) return;
        const id = parseInt(taskItem.dataset.id, 10);
        const task = tasks.find(t => t.id === id);

        if (e.target.matches('input[type="checkbox"]')) {
            if (task) {
                task.completed = !task.completed;
                saveTasks();
                taskItem.classList.toggle('completed');
            }
        }
        if (e.target.closest('.delete-task-btn')) {
             taskItem.classList.add('slide-out');
             taskItem.addEventListener('animationend', () => {
                 tasks = tasks.filter(t => t.id !== id);
                 saveTasks();
                 taskItem.remove();
                 if (tasks.length === 0) renderTasks();
             }, { once: true });
        }
    });

    // Voice Listener
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