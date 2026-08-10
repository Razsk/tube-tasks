import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
  Alert
} from 'react-native';

import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure how notifications appear when app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// NATIVE EXPO APIS FOR SYSTEM BACKUPS
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

// --- TUBE DESIGN SYSTEM ---
const TUBE_COLORS = {
  red: '#DC241F',     
  blue: '#0019A8',    
  yellow: '#FFCE00',  
  green: '#007229',   
  purple: '#9B0058',  
  black: '#000000',   
  white: '#FFFFFF',
  grey: '#868F98',    
  background: '#F4F4F4',
};

const TAG_COLORS = {
  'Health': TUBE_COLORS.red,
  'Work': TUBE_COLORS.blue,
  'Errands': TUBE_COLORS.yellow,
  'Home': TUBE_COLORS.green,
  'Research': TUBE_COLORS.purple,
};

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function App() {
  // --- STATE ---
  const [tasks, setTasks] = useState([
    {
      id: 'hist_1', title: 'Morning Workout', isReusable: true, isRoutine: true, tags: ['Health'], list: 'Daily', status: 'completed', 
      dueDate: Date.now() - 5*86400000, postponeCount: 1, hasTime: true,
      logs: [
        { action: 'postponed', date: new Date(Date.now() - 4*86400000).toISOString() },
        { action: 'completed', date: new Date(Date.now() - 2*86400000).toISOString() } 
      ]
    },
    {
      id: 'hist_2', title: 'Quarterly Report', isReusable: false, isRoutine: false, tags: ['Work'], list: 'Projects', status: 'completed', 
      dueDate: Date.now() - 7*86400000, postponeCount: 1, hasTime: false,
      logs: [
        { action: 'postponed', date: new Date(Date.now() - 6*86400000).toISOString() },
        { action: 'completed', date: new Date(Date.now() - 3*86400000).toISOString() }
      ]
    }
  ]);

  const [reusableTasks, setReusableTasks] = useState([
    { title: 'Morning Workout', tags: ['Health'], isRoutine: true, period: 1, timeText: '07:00' },
    { title: 'Check Emails', tags: ['Work'], isRoutine: true, period: 1, timeText: '09:00' }
  ]);
  
  const [showCreationStation, setShowCreationStation] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isReusable, setIsReusable] = useState(false);
  const [isRoutine, setIsRoutine] = useState(true);
  const [routinePeriod, setRoutinePeriod] = useState('1'); 
  const [editingTaskId, setEditingTaskId] = useState(null); 
  
  const [dateInput, setDateInput] = useState(getTodayStr());
  const [timeInput, setTimeInput] = useState(''); 
  const [selectedDateObj, setSelectedDateObj] = useState(new Date());
  const [selectedTimeObj, setSelectedTimeObj] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [importInput, setImportInput] = useState('');
  
  const [activeTab, setActiveTab] = useState('map'); // 'map' or 'analytics'
  const [historySearch, setHistorySearch] = useState('');

  const [availableTags] = useState(['Health', 'Work', 'Errands', 'Home', 'Research']);
  const [selectedTags, setSelectedTags] = useState([]);
  
  const [futureFilterLine, setFutureFilterLine] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [predictiveInsight, setPredictiveInsight] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const onDateChange = (event, date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDateObj(date);
      setDateInput(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
    }
  };

  const onTimeChange = (event, time) => {
    setShowTimePicker(false);
    if (time) {
      setSelectedTimeObj(time);
      setTimeInput(`${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
    }
  };

  // --- NOTIFICATION ENGINE ---
  const requestNotificationPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
    }
  };

  const scheduleTaskNotification = async (taskTitle, targetTimeMs, tagList = []) => {
    if (Platform.OS === 'web') return;
    try {
      const triggerSeconds = Math.max(1, Math.round((targetTimeMs - Date.now()) / 1000));
      const lineText = tagList.length > 0 ? `[${tagList.join(', ')} Line]` : '[Tube Tasks]';
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🚇 Departure Active: ${taskTitle}`,
          body: `Service ${lineText} is now due and ready on your route schedule!`,
          sound: true,
          data: { taskTitle },
        },
        trigger: {
          seconds: triggerSeconds,
        },
      });
    } catch (e) {
      console.log('Notification scheduling error:', e);
    }
  };

  const STORAGE_KEY_TASKS = '@tubetasks_tasks_v1';
  const STORAGE_KEY_REUSABLE = '@tubetasks_reusable_v1';
  const [isLoadedFromStorage, setIsLoadedFromStorage] = useState(false);

  // Load state on startup
  useEffect(() => {
    const loadState = async () => {
      try {
        const savedTasks = await AsyncStorage.getItem(STORAGE_KEY_TASKS);
        const savedReusable = await AsyncStorage.getItem(STORAGE_KEY_REUSABLE);
        if (savedTasks) setTasks(JSON.parse(savedTasks));
        if (savedReusable) setReusableTasks(JSON.parse(savedReusable));
      } catch (e) {
        console.log('Failed to load storage:', e);
      } finally {
        setIsLoadedFromStorage(true);
      }
    };
    loadState();
  }, []);

  // Save tasks to storage whenever state updates
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    const saveState = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
        await AsyncStorage.setItem(STORAGE_KEY_REUSABLE, JSON.stringify(reusableTasks));
      } catch (e) {
        console.log('Failed to save to storage:', e);
      }
    };
    saveState();
  }, [tasks, reusableTasks, isLoadedFromStorage]);

  useEffect(() => {
    requestNotificationPermissions();
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // --- BACKUP & RESTORE FILE SYSTEM ---
  const getBackupString = () => JSON.stringify({ tasks, reusableTasks });

  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(getBackupString());
    Alert.alert("Success", "Backup copied to clipboard!");
  };

  const saveToFile = async () => {
    try {
      const data = getBackupString();
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      const fileName = `tubetasks_backup_${timestamp}.json`;
      
      if (Platform.OS === 'web') {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Alert.alert("Success", "Backup file downloaded to device downloads!");
        return;
      }

      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, data, { encoding: FileSystem.EncodingType?.UTF8 || 'utf8' });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Save Tube Tasks Backup File',
          UTI: 'public.json'
        });
      } else {
        Alert.alert("Saved to Device", `Backup file saved as:\n${fileName}`);
      }
    } catch (e) {
      Alert.alert("Error Saving File", e?.message || "Could not write file to device storage.");
    }
  };

  const loadFromFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true
      });

      if (result.canceled === false && result.assets && result.assets.length > 0) {
        const fileUri = result.assets[0].uri;
        const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType?.UTF8 || 'utf8' });
        setImportInput(fileContent);
      }
    } catch (e) {
      Alert.alert("Error", "Could not read file. Make sure it is a valid text/JSON file.");
    }
  };

  const handleRestore = () => {
    try {
      if (!importInput.trim()) throw new Error("Empty input");
      const parsed = JSON.parse(importInput);
      if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.reusableTasks)) {
        setTasks(parsed.tasks);
        setReusableTasks(parsed.reusableTasks);
        Alert.alert("Success", "Service restored successfully!");
        setShowBackupModal(false);
        setImportInput('');
      } else {
        throw new Error("Invalid format");
      }
    } catch (e) {
      Alert.alert("Error", "Invalid ticket. Please check your backup data and try again.");
    }
  };

  // --- PREDICTION ENGINE ---
  const getSmartDelay = (targetTask) => {
    let totalDelayMs = 0;
    let matchCount = 0;
    tasks.forEach(t => {
      if (t.status === 'completed' && (t.title === targetTask.title || t.tags.some(tag => targetTask.tags.includes(tag)))) {
         const postponeLogs = t.logs.filter(l => l.action === 'postponed');
         const completeLog = t.logs.find(l => l.action === 'completed');
         if (postponeLogs.length > 0 && completeLog) {
           const firstPostpone = new Date(postponeLogs[0].date).getTime();
           const completedAt = new Date(completeLog.date).getTime();
           const delay = completedAt - firstPostpone;
           if (delay > 0) {
             const weight = (t.title === targetTask.title) ? 2 : 1;
             totalDelayMs += (delay * weight);
             matchCount += weight;
           }
         }
      }
    });
    if (matchCount === 0) return 1; 
    return Math.max(1, Math.round((totalDelayMs / matchCount) / 86400000));
  };

  // --- LOGIC ---
  const handleTextChange = (text) => {
    setInputText(text);
    if (text.length > 1 && !editingTaskId) {
      const matches = reusableTasks.filter(t => t.title.toLowerCase().includes(text.toLowerCase()));
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  };

  const applySuggestion = (template) => {
    setInputText(template.title);
    setIsReusable(true);
    setIsRoutine(template.isRoutine !== undefined ? template.isRoutine : true);
    setSelectedTags(template.tags || []);
    if (template.period) setRoutinePeriod(template.period.toString());
    
    setDateInput(getTodayStr());
    setTimeInput(template.timeText || '');
    setSuggestions([]);
  };

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) setSelectedTags(selectedTags.filter(t => t !== tag));
    else setSelectedTags([...selectedTags, tag]);
  };

  const parseDateTimeText = (dText, tText) => {
    const d = new Date();
    if (dText) {
      const parts = dText.split('-');
      if (parts.length === 3) d.setFullYear(parts[0], parts[1] - 1, parts[2]);
    }
    if (tText && tText.includes(':')) {
      const tParts = tText.split(':');
      if (tParts.length === 2) {
        d.setHours(tParts[0], tParts[1], 0, 0);
        return d.getTime();
      }
    }
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  };

  const saveTask = () => {
    if (!inputText.trim()) return;
    const periodDays = parseInt(routinePeriod, 10) || 1;
    const dueDate = parseDateTimeText(dateInput, timeInput);
    const hasTime = timeInput.includes(':');

    if (editingTaskId) {
      setTasks(prev => prev.map(t => {
        if (t.id === editingTaskId) {
          scheduleTaskNotification(inputText, dueDate, selectedTags);
          return { 
            ...t, title: inputText, isReusable, isRoutine, period: periodDays, 
            tags: selectedTags, dueDate, hasTime, timeText: timeInput 
          };
        }
        return t;
      }));
    } else {
      const newTask = {
        id: Date.now().toString(), title: inputText, isReusable, isRoutine, period: periodDays, 
        tags: selectedTags, status: 'pending', dueDate, postponeCount: 0, hasTime, timeText: timeInput,
        logs: [{ action: 'created', date: new Date().toISOString() }]
      };
      setTasks([...tasks, newTask]);
      scheduleTaskNotification(inputText, dueDate, selectedTags);

      if (isReusable) {
        const exists = reusableTasks.find(t => t.title.toLowerCase() === inputText.toLowerCase());
        if (!exists) {
          setReusableTasks([...reusableTasks, { 
            title: inputText, tags: selectedTags, isRoutine, period: periodDays, timeText: timeInput 
          }]);
        }
      }
    }
    
    setShowCreationStation(false);
    cancelEdit();
  };

  const editTask = (task) => {
    setShowCreationStation(true); 
    setEditingTaskId(task.id);
    setInputText(task.title);
    setIsReusable(task.isReusable || false);
    setIsRoutine(task.isRoutine || false);
    setSelectedTags(task.tags || []);
    if (task.isRoutine) setRoutinePeriod(task.period ? task.period.toString() : '1');
    
    const d = new Date(task.dueDate);
    setDateInput(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    setTimeInput(task.hasTime && task.timeText ? task.timeText : '');
  };

  const cancelEdit = () => {
    setEditingTaskId(null); setInputText(''); setIsReusable(false); setIsRoutine(true);
    setSelectedTags([]); setRoutinePeriod('1'); setDateInput(getTodayStr()); setTimeInput(''); setSuggestions([]);
  };

  const handleToggleForm = () => {
    if (showCreationStation && editingTaskId) cancelEdit();
    setShowCreationStation(!showCreationStation);
  };

  const completeTask = (id) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        const newLogs = [...t.logs, { action: 'completed', date: new Date().toISOString() }];
        if (t.isRoutine) {
          const nextDue = new Date(t.dueDate);
          nextDue.setDate(nextDue.getDate() + t.period);
          scheduleTaskNotification(t.title, nextDue.getTime(), t.tags);
          return { ...t, status: 'pending', dueDate: nextDue.getTime(), postponeCount: 0, logs: newLogs };
        }
        return { ...t, status: 'completed', postponeCount: 0, logs: newLogs };
      }
      return t;
    }));
  };

  const postponeTask = (id, smartDelayDays) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        const newCount = t.postponeCount + 1;
        const newLogs = [...t.logs, { action: 'postponed', date: new Date().toISOString() }];
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + smartDelayDays); 
        scheduleTaskNotification(t.title, nextDue.getTime(), t.tags);
        
        if (newCount >= 3 && t.isRoutine) {
          setPredictiveInsight(`"${t.title}" delayed often. System suggests +${smartDelayDays} days based on habit history.`);
        }
        return { ...t, status: 'postponed', dueDate: nextDue.getTime(), postponeCount: newCount, logs: newLogs };
      }
      return t;
    }));
  };

  // --- FILTERING ---
  const activeTasks = tasks.filter(t => t.id.startsWith('hist') === false);
  
  const mainRouteTasks = activeTasks.filter(t => 
    (t.status === 'pending' && t.dueDate <= currentTime) || (t.status === 'completed' && new Date(t.dueDate).toDateString() === new Date().toDateString())
  ).sort((a, b) => a.dueDate - b.dueDate);

  let futureTripsTasks = activeTasks.filter(t => 
    (t.status === 'pending' && t.dueDate > currentTime) || t.status === 'postponed'
  ).sort((a, b) => a.dueDate - b.dueDate);

  if (futureFilterLine) {
    futureTripsTasks = futureTripsTasks.filter(t => t.tags.includes(futureFilterLine));
  }

  // --- ANALYTICS & METRICS CALCULATIONS ---
  const getAnalyticsData = () => {
    let completedCount = 0;
    let postponedTotal = 0;
    const lineStats = {};
    availableTags.forEach(tag => {
      lineStats[tag] = { completed: 0, postponed: 0, delaySumMs: 0 };
    });

    const delayFrequencyMap = {};
    const heatmap = Array(4).fill(0).map(() => Array(7).fill(0)); // 4 time blocks x 7 days (Mon-Sun)
    const historyList = [];

    tasks.forEach(t => {
      const isCompleted = t.status === 'completed' || t.logs.some(l => l.action === 'completed');
      if (isCompleted) completedCount++;

      const postponeLogs = t.logs.filter(l => l.action === 'postponed');
      postponedTotal += postponeLogs.length;

      if (postponeLogs.length > 0) {
        delayFrequencyMap[t.title] = (delayFrequencyMap[t.title] || 0) + postponeLogs.length;
      }

      t.tags.forEach(tag => {
        if (lineStats[tag]) {
          if (isCompleted) lineStats[tag].completed++;
          lineStats[tag].postponed += postponeLogs.length;
        }
      });

      t.logs.forEach(log => {
        const logDate = new Date(log.date);
        historyList.push({
          taskId: t.id,
          title: t.title,
          tags: t.tags,
          action: log.action,
          date: logDate,
          iso: log.date
        });

        if (log.action === 'completed') {
          let dayIndex = logDate.getDay() - 1; // Mon = 0
          if (dayIndex < 0) dayIndex = 6; // Sun = 6
          
          const hours = logDate.getHours();
          let timeBlock = 0; // Morning (06-12)
          if (hours >= 12 && hours < 17) timeBlock = 1; // Afternoon (12-17)
          else if (hours >= 17 && hours < 22) timeBlock = 2; // Evening (17-22)
          else if (hours >= 22 || hours < 6) timeBlock = 3; // Night (22-06)

          heatmap[timeBlock][dayIndex] += 1;
        }
      });
    });

    const totalOps = completedCount + postponedTotal;
    const onTimeRate = totalOps > 0 ? Math.round((completedCount / totalOps) * 100) : 100;

    const topDelays = Object.entries(delayFrequencyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    historyList.sort((a, b) => b.date - a.date);

    return { completedCount, postponedTotal, onTimeRate, lineStats, topDelays, heatmap, historyList };
  };

  const getDynamicLineColor = (task) => {
    if (task.status === 'completed') return '#E0E0E0';
    if (task.tags && task.tags.length > 0) return TAG_COLORS[task.tags[0]] || TUBE_COLORS.black;
    return TUBE_COLORS.blue;
  };

  const renderTaskNode = (task, index, array, isFuture = false) => {
    const isLast = index === array.length - 1;
    const isCompleted = task.status === 'completed';
    const isPostponed = task.status === 'postponed';
    const smartDelay = getSmartDelay(task);
    const lineColor = getDynamicLineColor(task);

    const timeOptions = task.hasTime ? { hour: '2-digit', minute:'2-digit' } : {};
    const dueString = new Date(task.dueDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...timeOptions });

    return (
      <View key={task.id} style={styles.stationContainer}>
        <View style={[styles.tubeLine, { backgroundColor: lineColor }, isLast && styles.tubeLineLast, isCompleted && styles.tubeLineCompleted]} />
        <View style={[styles.stationNode, { borderColor: lineColor }, isCompleted && styles.stationNodeCompleted]} />

        <View style={[styles.taskCard, isCompleted && styles.taskCardCompleted]}>
          <View style={styles.taskHeader}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.taskTitle, isCompleted && styles.taskTitleCompleted]}>{task.title}</Text>
              {task.isRoutine && <Text style={styles.routineIcon}> ⟳</Text>}
            </View>
          </View>
          
          <View style={styles.taskTags}>
            {task.tags.map(tag => {
              const tagColor = TAG_COLORS[tag] || TUBE_COLORS.black;
              const isYellow = tagColor === TUBE_COLORS.yellow;
              return (
                <View key={tag} style={[styles.smallTag, { backgroundColor: tagColor }]}>
                  <Text style={[styles.smallTagText, { color: isYellow ? TUBE_COLORS.black : TUBE_COLORS.white }]}>{tag}</Text>
                </View>
              );
            })}
            
            {(isFuture || !task.hasTime) && <Text style={styles.futureAlert}>{isFuture ? 'Due: ' : 'Target: '}{dueString}</Text>}
            {task.postponeCount > 0 && !isCompleted && <Text style={styles.postponeAlert}>Delayed x{task.postponeCount}</Text>}
          </View>

          {!isCompleted && !isFuture && (
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: TUBE_COLORS.green }]} onPress={() => completeTask(task.id)}>
                <Text style={styles.iconBtnText}>✓</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: TUBE_COLORS.yellow }]} onPress={() => postponeTask(task.id, smartDelay)}>
                <Text style={[styles.iconBtnText, { color: TUBE_COLORS.black, fontSize: 18 }]}>⏱</Text>
                <View style={styles.delayBadge}>
                  <Text style={styles.delayBadgeText}>{smartDelay}d</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: TUBE_COLORS.grey }]} onPress={() => editTask(task)}>
                <Text style={styles.iconBtnText}>✎</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isCompleted && isFuture && (
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: TUBE_COLORS.grey }]} onPress={() => completeTask(task.id)}>
                <Text style={styles.iconBtnText}>✓</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: TUBE_COLORS.grey }]} onPress={() => editTask(task)}>
                <Text style={styles.iconBtnText}>✎</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  // --- RENDER ---
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={TUBE_COLORS.blue} />
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerSettingsBtn} onPress={() => setShowBackupModal(true)}>
            <Text style={styles.headerSettingsText}>⚙️</Text>
          </TouchableOpacity>
          
          <View style={styles.roundelContainer}>
            <View style={styles.roundelOuter} />
            <View style={styles.roundelBar}>
              <Text style={styles.headerText}>TUBE TASKS</Text>
            </View>
          </View>
          
          <TouchableOpacity style={styles.headerAddBtn} onPress={handleToggleForm}>
            <Text style={styles.headerAddBtnText}>{showCreationStation ? '✕' : '＋'}</Text>
          </TouchableOpacity>
        </View>

        {/* TAB SELECTOR */}
        <View style={styles.tabSelectorRow}>
          <TouchableOpacity 
            style={[styles.navTabBtn, activeTab === 'map' && styles.navTabBtnActive]} 
            onPress={() => setActiveTab('map')}
          >
            <Text style={[styles.navTabText, activeTab === 'map' && styles.navTabTextActive]}>🚇 SERVICE MAP</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.navTabBtn, activeTab === 'analytics' && styles.navTabBtnActive]} 
            onPress={() => setActiveTab('analytics')}
          >
            <Text style={[styles.navTabText, activeTab === 'analytics' && styles.navTabTextActive]}>📊 METRICS & LOGS</Text>
          </TouchableOpacity>
        </View>

        {predictiveInsight && (
          <View style={styles.insightBox}>
            <Text style={styles.insightTitle}>Service Update</Text>
            <Text style={styles.insightText}>{predictiveInsight}</Text>
            <TouchableOpacity onPress={() => setPredictiveInsight(null)} style={styles.insightBtn}>
              <Text style={styles.insightBtnText}>Acknowledge</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'analytics' ? (
          <ScrollView style={styles.mainScroll}>
            {(() => {
              const stats = getAnalyticsData();
              const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
              const timeBlocks = ['Morn (06-12)', 'Aft (12-17)', 'Eve (17-22)', 'Night (22-06)'];
              let maxCount = 1;
              stats.heatmap.forEach(row => row.forEach(val => { if (val > maxCount) maxCount = val; }));

              const filteredHistory = stats.historyList.filter(item => 
                !historySearch.trim() || item.title.toLowerCase().includes(historySearch.toLowerCase()) || item.action.toLowerCase().includes(historySearch.toLowerCase())
              );

              return (
                <View style={styles.analyticsContainer}>
                  {/* METRIC 1: ON-TIME PERFORMANCE RATE */}
                  <Text style={styles.sectionLabel}>SYSTEM PERFORMANCE</Text>
                  <View style={styles.statsCard}>
                    <View style={styles.gaugeRow}>
                      <View style={styles.gaugeCircle}>
                        <Text style={styles.gaugeValue}>{stats.onTimeRate}%</Text>
                        <Text style={styles.gaugeLabel}>Reliability</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={styles.metricTitle}>On-Time Completion Rate</Text>
                        <Text style={styles.metricSub}>Calculated from completed tasks vs delays/postponements.</Text>
                        <View style={styles.statSummaryRow}>
                          <Text style={styles.statSummaryText}>✓ Completed: <Text style={{fontWeight:'900'}}>{stats.completedCount}</Text></Text>
                          <Text style={styles.statSummaryText}>⏱ Postponed: <Text style={{fontWeight:'900', color: TUBE_COLORS.red}}>{stats.postponedTotal}</Text></Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* METRIC 2: HEATMAP (COMPLETION TIME Y-AXIS, WEEK DAY X-AXIS) */}
                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>COMPLETION TIME HEATMAP</Text>
                  <View style={styles.statsCard}>
                    <Text style={styles.metricSub}>Task completions mapped by Day of Week (X) and Time Block (Y):</Text>
                    
                    {/* Day Headers (X-Axis) */}
                    <View style={styles.heatmapHeaderRow}>
                      <View style={{ width: 85 }} />
                      {days.map(day => (
                        <Text key={day} style={styles.heatmapHeaderCell}>{day}</Text>
                      ))}
                    </View>

                    {/* Heatmap Rows (Y-Axis) */}
                    {timeBlocks.map((blockLabel, rIdx) => (
                      <View key={blockLabel} style={styles.heatmapRow}>
                        <Text style={styles.heatmapYLabel}>{blockLabel}</Text>
                        {days.map((_, cIdx) => {
                          const val = stats.heatmap[rIdx][cIdx];
                          const opacity = val > 0 ? 0.2 + (val / maxCount) * 0.8 : 0.05;
                          return (
                            <View 
                              key={cIdx} 
                              style={[
                                styles.heatmapCell, 
                                { backgroundColor: val > 0 ? TUBE_COLORS.blue : TUBE_COLORS.grey, opacity }
                              ]}
                            >
                              <Text style={[styles.heatmapCellText, val > 0 && { color: TUBE_COLORS.white }]}>
                                {val > 0 ? val : ''}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ))}
                  </View>

                  {/* METRIC 3: LINE RELIABILITY BREAKDOWN */}
                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>LINE RELIABILITY BREAKDOWN</Text>
                  <View style={styles.statsCard}>
                    {availableTags.map(tag => {
                      const data = stats.lineStats[tag] || { completed: 0, postponed: 0 };
                      const total = data.completed + data.postponed;
                      const pct = total > 0 ? Math.round((data.completed / total) * 100) : 100;
                      const tagColor = TAG_COLORS[tag] || TUBE_COLORS.blue;
                      return (
                        <View key={tag} style={styles.lineStatRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <View style={[styles.lineStatDot, { backgroundColor: tagColor }]} />
                            <Text style={styles.lineStatName}>{tag} Line</Text>
                            <Text style={styles.lineStatPct}>{pct}%</Text>
                          </View>
                          <View style={styles.lineStatTrack}>
                            <View style={[styles.lineStatFill, { width: `${pct}%`, backgroundColor: tagColor }]} />
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {/* METRIC 4: FREQUENT SIGNAL FAILURES (TOP DELAYED ROUTINES) */}
                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>FREQUENT DELAYS ("SIGNAL FAILURES")</Text>
                  <View style={styles.statsCard}>
                    {stats.topDelays.length === 0 ? (
                      <Text style={styles.emptyText}>No frequent task delays logged.</Text>
                    ) : (
                      stats.topDelays.map(([title, count], idx) => (
                        <View key={title} style={styles.delayStatItem}>
                          <Text style={styles.delayStatRank}>#{idx + 1}</Text>
                          <Text style={styles.delayStatTitle}>{title}</Text>
                          <View style={styles.delayStatBadge}>
                            <Text style={styles.delayStatBadgeText}>{count} delays</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>

                  {/* METRIC 5: JOURNEY HISTORY LOG */}
                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>JOURNEY HISTORY LOG</Text>
                  <View style={styles.statsCard}>
                    <TextInput 
                      style={styles.historySearchInput} 
                      placeholder="Search history by task or status..." 
                      value={historySearch} 
                      onChangeText={setHistorySearch}
                    />

                    {filteredHistory.length === 0 ? (
                      <Text style={styles.emptyText}>No logs match search.</Text>
                    ) : (
                      filteredHistory.slice(0, 15).map((log, idx) => {
                        const isComp = log.action === 'completed';
                        const isPost = log.action === 'postponed';
                        const dateStr = log.date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        return (
                          <View key={idx} style={styles.historyLogItem}>
                            <Text style={[
                              styles.historyActionBadge, 
                              isComp && { backgroundColor: TUBE_COLORS.green },
                              isPost && { backgroundColor: TUBE_COLORS.yellow, color: TUBE_COLORS.black }
                            ]}>
                              {log.action.toUpperCase()}
                            </Text>
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={styles.historyLogTitle}>{log.title}</Text>
                              <Text style={styles.historyLogDate}>{dateStr}</Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                </View>
              );
            })()}
          </ScrollView>
        ) : (
        <ScrollView style={styles.mainScroll} keyboardShouldPersistTaps="handled">
          
          {/* CREATION STATION */}
          {showCreationStation && (
            <View style={styles.creationStation}>
              <Text style={styles.sectionLabel}>{editingTaskId ? 'MAINTENANCE (EDIT TASK)' : 'NEW DEPARTURE'}</Text>
              
              <TextInput
                style={styles.input} placeholder="Enter task or routine..." placeholderTextColor={TUBE_COLORS.grey}
                value={inputText} onChangeText={handleTextChange}
              />

              {suggestions.length > 0 && !editingTaskId && (
                <View style={styles.suggestionsBox}>
                  {suggestions.map((s, idx) => (
                    <TouchableOpacity key={idx} style={styles.suggestionItem} onPress={() => applySuggestion(s)}>
                      <Text style={styles.suggestionText}>{s.title}</Text>
                      <Text style={styles.suggestionSub}>Template</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.tagsWrapper}>
                {availableTags.map(tag => {
                  const isActive = selectedTags.includes(tag);
                  const tagColor = TAG_COLORS[tag] || TUBE_COLORS.black;
                  const isYellow = tagColor === TUBE_COLORS.yellow;
                  return (
                    <TouchableOpacity 
                      key={tag} 
                      style={[styles.tagBadge, { borderColor: tagColor }, isActive && { backgroundColor: tagColor }]} 
                      onPress={() => toggleTag(tag)}
                    >
                      <Text style={[styles.tagText, { color: tagColor }, isActive && { color: isYellow ? TUBE_COLORS.black : TUBE_COLORS.white }]}>
                        {tag} Line
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleItem}>
                  <Text style={styles.toggleLabel}>Reusable</Text>
                  <Switch value={isReusable} onValueChange={setIsReusable} trackColor={{ true: TUBE_COLORS.blue }} />
                </View>
                <View style={styles.toggleItem}>
                  <Text style={styles.toggleLabel}>Routine</Text>
                  <Switch value={isRoutine} onValueChange={setIsRoutine} trackColor={{ true: TUBE_COLORS.blue }} />
                </View>
              </View>

              <View style={styles.routineSettings}>
                {isRoutine && (
                  <View style={styles.settingBlock}>
                    <Text style={styles.settingLabel}>Period (d)</Text>
                    <TextInput style={styles.settingInput} keyboardType="numeric" value={routinePeriod} onChangeText={setRoutinePeriod} />
                  </View>
                )}
                <TouchableOpacity style={[styles.settingBlock, { flex: 1.5 }]} onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.settingLabel}>Date 📅</Text>
                  <Text style={styles.settingInputText}>{dateInput || getTodayStr()}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.settingBlock} onPress={() => setShowTimePicker(true)}>
                  <Text style={styles.settingLabel}>Time ⏰</Text>
                  <Text style={styles.settingInputText}>{timeInput || 'Set Time'}</Text>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={selectedDateObj}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={selectedTimeObj}
                  mode="time"
                  is24Hour={true}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onTimeChange}
                />
              )}

              <View style={styles.buttonRow}>
                <TouchableOpacity style={[styles.addButton, editingTaskId && { flex: 1, marginRight: 8 }]} onPress={saveTask}>
                  <Text style={styles.addButtonText}>{editingTaskId ? 'UPDATE SERVICE' : 'ADD TO SCHEDULE'}</Text>
                </TouchableOpacity>
                {editingTaskId && (
                  <TouchableOpacity style={styles.cancelButton} onPress={() => { cancelEdit(); setShowCreationStation(false); }}>
                    <Text style={styles.cancelButtonText}>CANCEL</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* MAIN ROUTE MAP */}
          <View style={styles.mapContainer}>
            <Text style={styles.sectionLabel}>CURRENT SERVICE</Text>
            {mainRouteTasks.length === 0 && <Text style={styles.emptyText}>No services currently due.</Text>}
            {mainRouteTasks.map((task, index) => renderTaskNode(task, index, mainRouteTasks, false))}
          </View>

          {/* FUTURE TRIPS MAP & LINE FILTERS */}
          <View style={[styles.mapContainer, { paddingTop: 0, paddingBottom: 60 }]}>
            <View style={styles.futureHeaderRow}>
              <Text style={[styles.sectionLabel, { color: TUBE_COLORS.grey, flex: 1 }]}>FUTURE TRIPS & DELAYS</Text>
            </View>
            
            <View style={styles.filterWrapper}>
              <TouchableOpacity 
                style={[styles.filterBadge, !futureFilterLine && styles.filterBadgeActive]} 
                onPress={() => setFutureFilterLine(null)}
              >
                <Text style={[styles.filterText, !futureFilterLine && styles.filterTextActive]}>All Lines</Text>
              </TouchableOpacity>
              {availableTags.map(tag => {
                const isActive = futureFilterLine === tag;
                const tagColor = TAG_COLORS[tag] || TUBE_COLORS.black;
                const isYellow = tagColor === TUBE_COLORS.yellow;
                return (
                  <TouchableOpacity 
                    key={tag} 
                    style={[styles.filterBadge, { borderColor: tagColor }, isActive && { backgroundColor: tagColor }]} 
                    onPress={() => setFutureFilterLine(isActive ? null : tag)}
                  >
                    <Text style={[styles.filterText, { color: tagColor }, isActive && { color: isYellow ? TUBE_COLORS.black : TUBE_COLORS.white }]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {futureTripsTasks.length === 0 && <Text style={styles.emptyText}>No future trips on this line.</Text>}
            {futureTripsTasks.map((task, index) => renderTaskNode(task, index, futureTripsTasks, true))}
          </View>
        </ScrollView>
        )}
        
        {/* BACKUP & RESTORE MODAL WITH FILE OPS */}
        <Modal visible={showBackupModal} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>SYSTEM MAINTENANCE</Text>
              
              {/* BACKUP SECTION */}
              <Text style={styles.modalLabel}>Backup System State:</Text>
              <TextInput 
                style={styles.modalTextBox} 
                value={showBackupModal ? getBackupString() : ''} 
                multiline 
                editable={false} 
                selectable={true}
              />
              <View style={styles.actionRowModal}>
                <TouchableOpacity style={[styles.iconBtn, { backgroundColor: TUBE_COLORS.blue }]} onPress={copyToClipboard}>
                  <Text style={styles.iconBtnText}>📋</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.iconBtn, { backgroundColor: TUBE_COLORS.green }]} onPress={saveToFile}>
                  <Text style={styles.iconBtnText}>💾</Text>
                </TouchableOpacity>
              </View>
              
              {/* RESTORE SECTION */}
              <Text style={[styles.modalLabel, { marginTop: 16 }]}>Restore System State:</Text>
              <TextInput 
                style={[styles.modalTextBox, { height: 80 }]} 
                value={importInput} 
                onChangeText={setImportInput} 
                multiline 
                placeholder="Paste backup text or load file..." 
                selectable={true}
              />
              <View style={styles.actionRowModal}>
                <TouchableOpacity style={[styles.iconBtn, { backgroundColor: TUBE_COLORS.purple }]} onPress={loadFromFile}>
                  <Text style={styles.iconBtnText}>📂</Text>
                </TouchableOpacity>
              </View>
              
              {/* MODAL CONTROLS */}
              <View style={styles.modalControlRow}>
                <TouchableOpacity style={[styles.iconBtn, { backgroundColor: TUBE_COLORS.grey }]} onPress={() => { setShowBackupModal(false); setImportInput(''); }}>
                  <Text style={styles.iconBtnText}>✕</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.iconBtn, { backgroundColor: TUBE_COLORS.blue }]} onPress={handleRestore}>
                  <Text style={styles.iconBtnText}>✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </KeyboardAvoidingView>
    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TUBE_COLORS.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  keyboardView: { flex: 1 },
  header: { height: 90, alignItems: 'center', justifyContent: 'center', backgroundColor: TUBE_COLORS.white, borderBottomWidth: 4, borderBottomColor: TUBE_COLORS.blue, position: 'relative', zIndex: 10 },
  roundelContainer: { width: 180, height: 60, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  roundelOuter: { width: 56, height: 56, borderRadius: 28, borderWidth: 7, borderColor: TUBE_COLORS.red, backgroundColor: 'transparent', position: 'absolute' },
  roundelBar: { backgroundColor: TUBE_COLORS.blue, paddingHorizontal: 14, paddingVertical: 5, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  headerText: { color: TUBE_COLORS.white, fontWeight: '900', fontSize: 15, letterSpacing: 1.5, textAlign: 'center' },
  headerSettingsBtn: { position: 'absolute', left: 16, top: 26, width: 36, height: 36, justifyContent: 'center', alignItems: 'center', zIndex: 20 },
  headerSettingsText: { fontSize: 24 },
  headerAddBtn: { position: 'absolute', right: 16, top: 26, width: 36, height: 36, borderRadius: 18, backgroundColor: TUBE_COLORS.blue, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2, zIndex: 20 },
  headerAddBtnText: { color: TUBE_COLORS.white, fontSize: 20, fontWeight: 'bold', lineHeight: 22 },
  insightBox: { margin: 16, padding: 16, backgroundColor: TUBE_COLORS.yellow, borderLeftWidth: 8, borderLeftColor: TUBE_COLORS.black, borderRadius: 4 },
  insightTitle: { fontWeight: '900', color: TUBE_COLORS.black, marginBottom: 4, textTransform: 'uppercase' },
  insightText: { color: TUBE_COLORS.black, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  insightBtn: { backgroundColor: TUBE_COLORS.black, paddingVertical: 8, alignItems: 'center', borderRadius: 4 },
  insightBtnText: { color: TUBE_COLORS.white, fontWeight: 'bold' },
  mainScroll: { flex: 1 },
  sectionLabel: { fontWeight: '900', color: TUBE_COLORS.blue, fontSize: 14, marginBottom: 12, letterSpacing: 1 },
  creationStation: { backgroundColor: TUBE_COLORS.white, margin: 16, padding: 16, borderRadius: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  input: { borderBottomWidth: 3, borderBottomColor: TUBE_COLORS.black, fontSize: 18, fontWeight: '700', paddingVertical: 8, color: TUBE_COLORS.black, marginBottom: 12 },
  suggestionsBox: { backgroundColor: '#fff', borderWidth: 2, borderColor: TUBE_COLORS.blue, borderRadius: 4, marginBottom: 12, maxHeight: 120 },
  suggestionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  suggestionText: { fontWeight: 'bold', color: TUBE_COLORS.black },
  suggestionSub: { fontSize: 12, color: TUBE_COLORS.grey, marginTop: 2 },
  tagsWrapper: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  tagBadge: { borderWidth: 2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, marginBottom: 8 },
  tagText: { fontWeight: 'bold' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  toggleItem: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { fontWeight: 'bold', marginRight: 8, color: TUBE_COLORS.black },
  routineSettings: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F9F9F9', padding: 12, borderRadius: 6, marginBottom: 16, borderWidth: 1, borderColor: '#EEE' },
  settingBlock: { marginRight: 10, flex: 1 },
  settingLabel: { fontSize: 12, fontWeight: 'bold', color: TUBE_COLORS.grey, marginBottom: 4 },
  settingInput: { borderBottomWidth: 2, borderBottomColor: TUBE_COLORS.blue, fontSize: 16, fontWeight: 'bold', paddingVertical: 4, color: TUBE_COLORS.black },
  settingInputText: { borderBottomWidth: 2, borderBottomColor: TUBE_COLORS.blue, fontSize: 15, fontWeight: 'bold', paddingVertical: 6, color: TUBE_COLORS.black },
  buttonRow: { flexDirection: 'row' },
  addButton: { backgroundColor: TUBE_COLORS.black, padding: 14, alignItems: 'center', borderRadius: 4, flex: 1 },
  addButtonText: { color: TUBE_COLORS.yellow, fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  cancelButton: { backgroundColor: TUBE_COLORS.grey, padding: 14, alignItems: 'center', borderRadius: 4 },
  cancelButtonText: { color: TUBE_COLORS.white, fontWeight: '900', fontSize: 16 },
  mapContainer: { padding: 16 },
  emptyText: { fontStyle: 'italic', color: TUBE_COLORS.grey },
  stationContainer: { flexDirection: 'row', position: 'relative', marginBottom: 20 },
  tubeLine: { position: 'absolute', left: 14, top: 24, bottom: -40, width: 8, zIndex: 1 },
  tubeLineLast: { bottom: 24 },
  tubeLineCompleted: { backgroundColor: '#E0E0E0' },
  stationNode: { width: 24, height: 24, borderRadius: 12, borderWidth: 5, backgroundColor: TUBE_COLORS.white, marginTop: 20, marginLeft: 6, marginRight: 16, zIndex: 2 },
  stationNodeCompleted: { borderColor: '#E0E0E0' },
  stationNodePostponed: { borderColor: TUBE_COLORS.yellow },
  taskCard: { flex: 1, backgroundColor: TUBE_COLORS.white, padding: 16, borderRadius: 8, borderWidth: 2, borderColor: '#E0E0E0' },
  taskCardCompleted: { backgroundColor: '#F9F9F9', borderColor: '#EEEEEE' },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  taskTitle: { fontSize: 16, fontWeight: '800', color: TUBE_COLORS.black },
  taskTitleCompleted: { color: TUBE_COLORS.grey, textDecorationLine: 'line-through' },
  routineIcon: { fontSize: 18, color: TUBE_COLORS.blue, fontWeight: 'bold' },
  taskTags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  smallTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginRight: 6, marginBottom: 6 },
  smallTagText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  futureAlert: { fontSize: 11, fontWeight: 'bold', color: TUBE_COLORS.grey, marginBottom: 6, marginRight: 6 },
  postponeAlert: { fontSize: 11, fontWeight: 'bold', color: TUBE_COLORS.red, marginBottom: 6 },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1 },
  iconBtnText: { fontSize: 20, color: TUBE_COLORS.white, fontWeight: 'bold' },
  delayBadge: { position: 'absolute', top: -4, right: -6, backgroundColor: TUBE_COLORS.red, borderRadius: 10, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 1, borderColor: TUBE_COLORS.white },
  delayBadgeText: { color: TUBE_COLORS.white, fontSize: 10, fontWeight: 'bold' },
  futureHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  filterWrapper: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  filterBadge: { borderWidth: 1, borderColor: '#CCC', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  filterBadgeActive: { backgroundColor: TUBE_COLORS.grey, borderColor: TUBE_COLORS.grey },
  filterText: { fontSize: 12, fontWeight: 'bold', color: TUBE_COLORS.grey },
  filterTextActive: { color: TUBE_COLORS.white },
  
  // Modal & File System Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: TUBE_COLORS.white, padding: 20, borderRadius: 12, borderWidth: 4, borderColor: TUBE_COLORS.blue },
  modalTitle: { fontSize: 18, fontWeight: '900', color: TUBE_COLORS.blue, marginBottom: 16, textAlign: 'center', letterSpacing: 1 },
  modalLabel: { fontSize: 14, fontWeight: 'bold', color: TUBE_COLORS.black, marginBottom: 8 },
  modalTextBox: { borderWidth: 2, borderColor: TUBE_COLORS.grey, height: 70, borderRadius: 4, padding: 10, textAlignVertical: 'top', marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, backgroundColor: '#F9F9F9' },
  actionRowModal: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 12 },
  modalControlRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },

  // TAB SELECTOR
  tabSelectorRow: { flexDirection: 'row', backgroundColor: TUBE_COLORS.white, borderBottomWidth: 2, borderBottomColor: '#DDD' },
  navTabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  navTabBtnActive: { borderBottomColor: TUBE_COLORS.blue, backgroundColor: '#F0F4FF' },
  navTabText: { fontWeight: 'bold', fontSize: 12, color: TUBE_COLORS.grey, letterSpacing: 0.5 },
  navTabTextActive: { color: TUBE_COLORS.blue, fontWeight: '900' },

  // ANALYTICS & METRICS
  analyticsContainer: { padding: 16, paddingBottom: 60 },
  statsCard: { backgroundColor: TUBE_COLORS.white, borderRadius: 8, padding: 16, borderWidth: 2, borderColor: '#E0E0E0', elevation: 2 },
  gaugeRow: { flexDirection: 'row', alignItems: 'center' },
  gaugeCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 6, borderColor: TUBE_COLORS.blue, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FF' },
  gaugeValue: { fontSize: 22, fontWeight: '900', color: TUBE_COLORS.blue },
  gaugeLabel: { fontSize: 10, fontWeight: 'bold', color: TUBE_COLORS.grey, textTransform: 'uppercase' },
  metricTitle: { fontSize: 16, fontWeight: '900', color: TUBE_COLORS.black },
  metricSub: { fontSize: 12, color: TUBE_COLORS.grey, marginTop: 2, marginBottom: 8 },
  statSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  statSummaryText: { fontSize: 12, color: TUBE_COLORS.black },

  // HEATMAP STYLES
  heatmapHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  heatmapHeaderCell: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 'bold', color: TUBE_COLORS.grey },
  heatmapRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  heatmapYLabel: { width: 85, fontSize: 10, fontWeight: 'bold', color: TUBE_COLORS.grey },
  heatmapCell: { flex: 1, height: 26, borderRadius: 4, marginHorizontal: 1, justifyContent: 'center', alignItems: 'center' },
  heatmapCellText: { fontSize: 10, fontWeight: 'bold', color: TUBE_COLORS.black },

  // LINE STATS
  lineStatRow: { marginBottom: 10 },
  lineStatDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  lineStatName: { flex: 1, fontWeight: 'bold', fontSize: 13, color: TUBE_COLORS.black },
  lineStatPct: { fontWeight: '900', fontSize: 13, color: TUBE_COLORS.black },
  lineStatTrack: { height: 8, backgroundColor: '#EEE', borderRadius: 4, overflow: 'hidden' },
  lineStatFill: { height: '100%', borderRadius: 4 },

  // DELAY STATS
  delayStatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  delayStatRank: { fontWeight: '900', color: TUBE_COLORS.red, width: 24, fontSize: 14 },
  delayStatTitle: { flex: 1, fontWeight: 'bold', color: TUBE_COLORS.black, fontSize: 14 },
  delayStatBadge: { backgroundColor: TUBE_COLORS.yellow, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  delayStatBadgeText: { fontWeight: 'bold', fontSize: 11, color: TUBE_COLORS.black },

  // HISTORY LOGS
  historySearchInput: { borderBottomWidth: 2, borderBottomColor: TUBE_COLORS.blue, paddingVertical: 6, fontSize: 14, fontWeight: 'bold', marginBottom: 12, color: TUBE_COLORS.black },
  historyLogItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  historyActionBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, color: TUBE_COLORS.white, fontSize: 9, fontWeight: 'bold', overflow: 'hidden' },
  historyLogTitle: { fontWeight: 'bold', color: TUBE_COLORS.black, fontSize: 13 },
  historyLogDate: { fontSize: 10, color: TUBE_COLORS.grey }
});
