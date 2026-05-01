const statuses = ['To Do', 'In Progress', 'Done'];
const tokenKey = 'team-task-manager-token';

const state = {
  token: localStorage.getItem(tokenKey),
  user: null,
  projects: [],
  selectedProjectId: null,
  project: null,
  members: [],
  tasks: [],
  dashboard: null,
  toastTimer: null
};

const els = {
  authView: document.querySelector('#auth-view'),
  appView: document.querySelector('#app-view'),
  loginForm: document.querySelector('#login-form'),
  signupForm: document.querySelector('#signup-form'),
  userName: document.querySelector('#user-name'),
  logoutButton: document.querySelector('#logout-button'),
  projectForm: document.querySelector('#project-form'),
  joinForm: document.querySelector('#join-form'),
  projectList: document.querySelector('#project-list'),
  emptyState: document.querySelector('#empty-state'),
  projectView: document.querySelector('#project-view'),
  projectRole: document.querySelector('#project-role'),
  projectInvite: document.querySelector('#project-invite'),
  projectTitle: document.querySelector('#project-title'),
  projectDescription: document.querySelector('#project-description'),
  newTaskButton: document.querySelector('#new-task-button'),
  metricTotal: document.querySelector('#metric-total'),
  metricTodo: document.querySelector('#metric-todo'),
  metricProgress: document.querySelector('#metric-progress'),
  metricOverdue: document.querySelector('#metric-overdue'),
  statusBreakdown: document.querySelector('#status-breakdown'),
  userBreakdown: document.querySelector('#user-breakdown'),
  overdueList: document.querySelector('#overdue-list'),
  todoColumn: document.querySelector('#todo-column'),
  progressColumn: document.querySelector('#progress-column'),
  doneColumn: document.querySelector('#done-column'),
  memberForm: document.querySelector('#member-form'),
  memberList: document.querySelector('#member-list'),
  taskDialog: document.querySelector('#task-dialog'),
  taskDialogTitle: document.querySelector('#task-dialog-title'),
  taskDialogClose: document.querySelector('#task-dialog-close'),
  taskForm: document.querySelector('#task-form'),
  taskAssignee: document.querySelector('#task-assignee'),
  toast: document.querySelector('#toast')
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function isAdmin() {
  return state.project?.role === 'Admin';
}

function setToken(token) {
  state.token = token;
  if (token) {
    localStorage.setItem(tokenKey, token);
  } else {
    localStorage.removeItem(tokenKey);
  }
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;
  state.toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

function setBusy(form, busy) {
  for (const element of form.elements) {
    element.disabled = busy;
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
  });

  const contentType = response.headers.get('content-type') || '';
  const data = response.status === 204
    ? null
    : contentType.includes('application/json')
      ? await response.json()
      : { message: await response.text() };

  if (!response.ok) {
    if (response.status === 401) {
      logout(false);
    }

    throw new Error(data?.message || 'Request failed');
  }

  return data;
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showAuth() {
  els.authView.hidden = false;
  els.appView.hidden = true;
}

function showApp() {
  els.authView.hidden = true;
  els.appView.hidden = false;
  els.userName.textContent = state.user?.name || '';
}

function logout(withToast = true) {
  setToken(null);
  state.user = null;
  state.projects = [];
  state.project = null;
  state.members = [];
  state.tasks = [];
  state.dashboard = null;
  state.selectedProjectId = null;
  showAuth();

  if (withToast) {
    showToast('Logged out');
  }
}

function setAuthTab(tab) {
  const loginActive = tab === 'login';
  els.loginForm.hidden = !loginActive;
  els.signupForm.hidden = loginActive;

  document.querySelectorAll('[data-auth-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.authTab === tab);
  });
}

async function boot() {
  bindEvents();

  if (!state.token) {
    showAuth();
    return;
  }

  try {
    const { user } = await api('/auth/me');
    state.user = user;
    showApp();
    await loadProjects();
  } catch (error) {
    logout(false);
  }
}

function bindEvents() {
  document.querySelectorAll('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => setAuthTab(button.dataset.authTab));
  });

  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitForm(els.loginForm, async () => {
      const { email, password } = formValues(els.loginForm);
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      setToken(data.token);
      state.user = data.user;
      showApp();
      await loadProjects();
      showToast('Welcome back');
    });
  });

  els.signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitForm(els.signupForm, async () => {
      const { name, email, password } = formValues(els.signupForm);
      const data = await api('/auth/signup', {
        method: 'POST',
        body: { name, email, password }
      });
      setToken(data.token);
      state.user = data.user;
      showApp();
      await loadProjects();
      showToast('Account created');
    });
  });

  els.logoutButton.addEventListener('click', () => logout());

  els.projectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitForm(els.projectForm, async () => {
      const values = formValues(els.projectForm);
      const { project } = await api('/projects', {
        method: 'POST',
        body: values
      });
      els.projectForm.reset();
      state.selectedProjectId = project.id;
      await loadProjects();
      showToast('Project created');
    });
  });

  els.joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitForm(els.joinForm, async () => {
      const values = formValues(els.joinForm);
      const { project } = await api('/projects/join', {
        method: 'POST',
        body: { inviteCode: values.inviteCode.trim().toUpperCase() }
      });
      els.joinForm.reset();
      state.selectedProjectId = project.id;
      await loadProjects();
      showToast('Project joined');
    });
  });

  els.projectList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-project-id]');
    if (!button) {
      return;
    }

    await selectProject(Number(button.dataset.projectId));
  });

  els.newTaskButton.addEventListener('click', () => openTaskDialog());
  els.taskDialogClose.addEventListener('click', closeTaskDialog);

  els.taskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitTaskForm();
  });

  els.projectView.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-task-edit]');
    const deleteButton = event.target.closest('[data-task-delete]');
    const removeButton = event.target.closest('[data-member-remove]');

    if (editButton) {
      const task = state.tasks.find((item) => item.id === Number(editButton.dataset.taskEdit));
      openTaskDialog(task);
      return;
    }

    if (deleteButton) {
      const taskId = Number(deleteButton.dataset.taskDelete);
      if (!window.confirm('Delete this task?')) {
        return;
      }

      await api(`/tasks/${taskId}`, { method: 'DELETE' });
      await refreshProject();
      showToast('Task deleted');
      return;
    }

    if (removeButton) {
      const userId = Number(removeButton.dataset.memberRemove);
      if (!window.confirm('Remove this member from the project?')) {
        return;
      }

      await api(`/projects/${state.selectedProjectId}/members/${userId}`, { method: 'DELETE' });
      await refreshProject();
      showToast('Member removed');
    }
  });

  els.projectView.addEventListener('change', async (event) => {
    const statusSelect = event.target.closest('[data-task-status]');
    const roleSelect = event.target.closest('[data-member-role]');

    if (statusSelect) {
      const taskId = Number(statusSelect.dataset.taskStatus);
      await api(`/tasks/${taskId}`, {
        method: 'PUT',
        body: { status: statusSelect.value }
      });
      await refreshProject();
      showToast('Task updated');
      return;
    }

    if (roleSelect) {
      const userId = Number(roleSelect.dataset.memberRole);
      await api(`/projects/${state.selectedProjectId}/members/${userId}`, {
        method: 'PUT',
        body: { role: roleSelect.value }
      });
      await refreshProject();
      showToast('Role updated');
    }
  });

  els.memberForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitForm(els.memberForm, async () => {
      const values = formValues(els.memberForm);
      await api(`/projects/${state.selectedProjectId}/members`, {
        method: 'POST',
        body: values
      });
      els.memberForm.reset();
      await refreshProject();
      showToast('Member added');
    });
  });
}

async function submitForm(form, callback) {
  try {
    setBusy(form, true);
    await callback();
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(form, false);
  }
}

async function loadProjects() {
  const { projects } = await api('/projects');
  state.projects = projects;

  if (state.projects.length === 0) {
    state.selectedProjectId = null;
    state.project = null;
    renderProjects();
    renderEmpty();
    return;
  }

  const selectedStillExists = state.projects.some((project) => project.id === state.selectedProjectId);
  if (!selectedStillExists) {
    state.selectedProjectId = state.projects[0].id;
  }

  renderProjects();
  await loadProject(state.selectedProjectId);
}

async function selectProject(projectId) {
  state.selectedProjectId = projectId;
  renderProjects();
  await loadProject(projectId);
}

async function refreshProject() {
  await loadProjects();
}

async function loadProject(projectId) {
  const [details, taskData, dashboardData] = await Promise.all([
    api(`/projects/${projectId}`),
    api(`/projects/${projectId}/tasks`),
    api(`/projects/${projectId}/dashboard`)
  ]);

  state.project = details.project;
  state.members = details.members;
  state.tasks = taskData.tasks;
  state.dashboard = dashboardData.dashboard;
  renderProject();
}

function renderProjects() {
  if (!state.projects.length) {
    els.projectList.innerHTML = '<p class="empty-note">No projects yet.</p>';
    return;
  }

  els.projectList.innerHTML = state.projects.map((project) => {
    const done = Number(project.doneTasks || 0);
    const total = Number(project.totalTasks || 0);
    return `
      <button type="button" class="project-button ${project.id === state.selectedProjectId ? 'active' : ''}" data-project-id="${project.id}">
        <strong>${escapeHtml(project.name)}</strong>
        <span>${escapeHtml(project.role)} · ${done}/${total} done · ${project.memberCount} members</span>
      </button>
    `;
  }).join('');
}

function renderEmpty() {
  els.emptyState.hidden = false;
  els.projectView.hidden = true;
}

function renderProject() {
  if (!state.project) {
    renderEmpty();
    return;
  }

  els.emptyState.hidden = true;
  els.projectView.hidden = false;
  els.projectRole.textContent = state.project.role;
  els.projectInvite.textContent = `Invite ${state.project.inviteCode}`;
  els.projectTitle.textContent = state.project.name;
  els.projectDescription.textContent = state.project.description || '';
  els.newTaskButton.hidden = !isAdmin();
  els.memberForm.hidden = !isAdmin();

  renderDashboard();
  renderTasks();
  renderMembers();
}

function renderDashboard() {
  const dashboard = state.dashboard || { byStatus: {}, perUser: [], overdueTasks: [] };
  const byStatus = dashboard.byStatus || {};
  const todo = byStatus['To Do'] || 0;
  const progress = byStatus['In Progress'] || 0;

  els.metricTotal.textContent = dashboard.totalTasks || 0;
  els.metricTodo.textContent = todo;
  els.metricProgress.textContent = progress;
  els.metricOverdue.textContent = dashboard.overdueCount || 0;

  renderBars(
    els.statusBreakdown,
    statuses.map((status) => ({ label: status, count: byStatus[status] || 0 }))
  );
  renderBars(
    els.userBreakdown,
    (dashboard.perUser || []).map((row) => ({ label: row.name, count: row.count }))
  );

  if (!dashboard.overdueTasks?.length) {
    els.overdueList.innerHTML = '<p class="empty-note">No overdue tasks.</p>';
    return;
  }

  els.overdueList.innerHTML = dashboard.overdueTasks.map((task) => `
    <div class="compact-item">
      <strong>${escapeHtml(task.title)}</strong>
      <span>${escapeHtml(task.dueDate)} · ${escapeHtml(task.assignedName || 'Unassigned')}</span>
    </div>
  `).join('');
}

function renderBars(container, rows) {
  if (!rows.length || rows.every((row) => Number(row.count) === 0)) {
    container.innerHTML = '<p class="empty-note">No tasks to show.</p>';
    return;
  }

  const max = Math.max(...rows.map((row) => Number(row.count)), 1);
  container.innerHTML = rows.map((row) => {
    const count = Number(row.count || 0);
    const width = Math.max((count / max) * 100, count > 0 ? 8 : 0);
    return `
      <div class="bar-row">
        <div class="bar-label">
          <span>${escapeHtml(row.label)}</span>
          <span>${count}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width: ${width}%"></div></div>
      </div>
    `;
  }).join('');
}

function renderTasks() {
  const columns = {
    'To Do': els.todoColumn,
    'In Progress': els.progressColumn,
    Done: els.doneColumn
  };

  for (const status of statuses) {
    const tasks = state.tasks.filter((task) => task.status === status);
    columns[status].innerHTML = tasks.length
      ? tasks.map(renderTaskCard).join('')
      : '<p class="empty-note">No tasks.</p>';
  }
}

function renderTaskCard(task) {
  const canManage = isAdmin();
  const canUpdateStatus = canManage || task.assignedTo === state.user.id;
  const dueText = task.dueDate ? `Due ${task.dueDate}` : 'No due date';
  const overdue = task.dueDate && task.status !== 'Done' && task.dueDate < todayIso();
  const description = task.description ? `<p>${escapeHtml(task.description)}</p>` : '';
  const statusControl = canUpdateStatus
    ? `<select data-task-status="${task.id}" aria-label="Task status">${statusOptions(task.status)}</select>`
    : `<span class="status-chip">${escapeHtml(task.status)}</span>`;
  const adminActions = canManage
    ? `
        <button type="button" class="ghost-button" data-task-edit="${task.id}">Edit</button>
        <button type="button" class="ghost-button danger" data-task-delete="${task.id}">Delete</button>
      `
    : '';

  return `
    <article class="task-card">
      <div>
        <h3>${escapeHtml(task.title)}</h3>
        ${description}
      </div>
      <div class="task-meta">
        <span class="priority-pill ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span>
        <span class="due-text ${overdue ? 'overdue' : ''}">${escapeHtml(dueText)}</span>
      </div>
      <span class="assignee">${escapeHtml(task.assignedName || 'Unassigned')}</span>
      <div class="task-actions">
        ${statusControl}
        ${adminActions}
      </div>
    </article>
  `;
}

function statusOptions(selectedStatus) {
  return statuses.map((status) => `
    <option value="${escapeHtml(status)}" ${status === selectedStatus ? 'selected' : ''}>${escapeHtml(status)}</option>
  `).join('');
}

function renderMembers() {
  if (!state.members.length) {
    els.memberList.innerHTML = '<p class="empty-note">No members.</p>';
    return;
  }

  els.memberList.innerHTML = state.members.map((member) => {
    const controls = isAdmin()
      ? `
        <div class="member-controls">
          <select data-member-role="${member.id}" aria-label="Member role">
            <option value="Member" ${member.role === 'Member' ? 'selected' : ''}>Member</option>
            <option value="Admin" ${member.role === 'Admin' ? 'selected' : ''}>Admin</option>
          </select>
          <button type="button" class="ghost-button danger" data-member-remove="${member.id}" ${member.id === state.user.id ? 'disabled' : ''}>Remove</button>
        </div>
      `
      : `<span class="role-badge">${escapeHtml(member.role)}</span>`;

    return `
      <div class="member-row">
        <div class="member-main">
          <strong>${escapeHtml(member.name)}</strong>
          <span>${escapeHtml(member.email)} · ${member.assignedTasks} assigned</span>
        </div>
        ${controls}
      </div>
    `;
  }).join('');
}

function openTaskDialog(task = null) {
  if (!isAdmin()) {
    return;
  }

  els.taskDialogTitle.textContent = task ? 'Edit Task' : 'New Task';
  fillAssignees(task?.assignedTo || '');
  els.taskForm.elements.taskId.value = task?.id || '';
  els.taskForm.elements.title.value = task?.title || '';
  els.taskForm.elements.description.value = task?.description || '';
  els.taskForm.elements.dueDate.value = task?.dueDate || '';
  els.taskForm.elements.priority.value = task?.priority || 'Medium';
  els.taskForm.elements.status.value = task?.status || 'To Do';
  els.taskForm.elements.assignedTo.value = task?.assignedTo || '';
  els.taskDialog.showModal();
}

function closeTaskDialog() {
  els.taskDialog.close();
}

function fillAssignees(selectedValue) {
  const options = state.members.map((member) => `
    <option value="${member.id}" ${Number(selectedValue) === member.id ? 'selected' : ''}>${escapeHtml(member.name)}</option>
  `);
  els.taskAssignee.innerHTML = '<option value="">Unassigned</option>' + options.join('');
}

async function submitTaskForm() {
  await submitForm(els.taskForm, async () => {
    const values = formValues(els.taskForm);
    const assignedTo = values.assignedTo ? Number(values.assignedTo) : null;
    const payload = {
      title: values.title,
      description: values.description,
      dueDate: values.dueDate || null,
      priority: values.priority,
      status: values.status,
      assignedTo
    };

    if (values.taskId) {
      await api(`/tasks/${values.taskId}`, {
        method: 'PUT',
        body: payload
      });
      showToast('Task saved');
    } else {
      await api(`/projects/${state.selectedProjectId}/tasks`, {
        method: 'POST',
        body: payload
      });
      showToast('Task created');
    }

    closeTaskDialog();
    els.taskForm.reset();
    await refreshProject();
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

boot();
