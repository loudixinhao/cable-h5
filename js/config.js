/* config.js —— 全局配置 + 默认「模块/字段」蓝图（管理员可在后台改） */
window.CFG = {
  APP_NAME: '娄底信号车间工作台',
  ADMIN_PIN: '2468',                 // 管理后台口令，进后台后可自行修改
  TEMP_PHONE: '058539287',           // 不足4小时作业临时审批电话
  TEST_DAY: 25,                      // 周期起止日
  TEST_HOUR: 16,                     // 周期起止时刻(16:00)
  INSULATION_THRESHOLD: 1,           // 绝缘合格阈值 MΩ，低于标红
  STORAGE_KEY: 'ldwork_v3',          // 本地数据键
  CLOUD_TABLE: 'app_data',           // 云端表名（单条文档共享）
  CLOUD_DOC_ID: 'main'               // 云端文档ID
};

/* 字段类型清单（后台新增字段时可选） */
window.FIELD_TYPES = [
  { t: 'text',      n: '单行文本' },
  { t: 'textarea',  n: '多行文本' },
  { t: 'number',    n: '数字' },
  { t: 'date',      n: '日期' },
  { t: 'time',      n: '时间' },
  { t: 'select',    n: '下拉选择' },
  { t: 'station',   n: '站点选择(按线)' },
  { t: 'phone',     n: '电话/拨号' },
  { t: 'detail',    n: '明细表(多行)' }
];

/* 字段角色：供统计/预警识别 */
window.FIELD_ROLES = [
  { r: '',            n: '无' },
  { r: 'station',     n: '站点(参与覆盖统计)' },
  { r: 'date',        n: '日期(参与周期判断)' },
  { r: 'title',       n: '台账标题' },
  { r: 'line',        n: '线别' },
  { r: 'badge',       n: '状态标签' }
];

/* 默认站点（娄底信号车间，按线） */
window.DEFAULT_LINES = [
  { name: '益湛线', stations: ['壶天站','老粮仓站','横市站','青山桥站'] },
  { name: '沪昆线', stations: ['普安堂站','棋梓桥站','胜昔桥站','娄底东站','娄底站','娄底编尾站','娄底到达场','百亩井站','杨市站'] }
];

/* 默认模块蓝图 */
window.DEFAULT_SCHEMA = {
  version: 3,
  workshop: '娄底信号车间',
  lines: JSON.parse(JSON.stringify(window.DEFAULT_LINES)),
  threshold: 1,
  testDay: 25,
  testHour: 16,
  tempPhone: '058539287',
  adminPin: '2468',
  // 区域盯控：默认分区模板（管理员可改），按站可单独覆盖
  zones: ['一区', '二区', '三区'],
  stationZones: {},   // 例：{ '壶天站': ['上行','下行','咽喉'] }；未设置则用 zones
  // 团队云配置（由管理员在后台填写；工友扫「加入码」自动获得）
  cloud: { enabled: false, url: '', key: '' },
  modules: [
    {
      id: 'm_insulation', name: '电缆绝缘测试', icon: '绝', desc: '25日16:00周期全覆盖',
      enabled: true, coverage: true, order: 1,
      fields: [
        { key:'station', label:'站点', type:'station', required:true, role:'station', showInList:true },
        { key:'testDate', label:'测试日期', type:'date', required:true, role:'date', showInList:true },
        { key:'tester', label:'测试人', type:'text', required:true, role:'', showInList:true, remember:true },
        { key:'weather', label:'天气', type:'select', options:['晴','阴','雨','雪','雾'], role:'', showInList:false },
        { key:'megger', label:'兆欧表编号', type:'text', role:'', showInList:false, remember:true },
        { key:'details', label:'绝缘测试明细', type:'detail', role:'', showInList:false,
          columns:[
            { key:'cable', label:'电缆/芯线', type:'text', role:'' },
            { key:'value', label:'绝缘值(MΩ)', type:'number', role:'insulation' }
          ] },
        { key:'remark', label:'备注', type:'textarea', role:'', showInList:false }
      ]
    },
    {
      id: 'm_construct', name: '施工报备', icon: '施', desc: '次日施工 · 报李冬龙',
      enabled: true, coverage: false, order: 2,
      fields: [
        { key:'workDate', label:'施工日期', type:'date', required:true, role:'date', showInList:true },
        { key:'station', label:'站点', type:'station', required:true, role:'station', showInList:true },
        { key:'line', label:'线别', type:'select', options:['益湛线','沪昆线'], role:'line', showInList:false },
        { key:'content', label:'作业内容', type:'textarea', required:true, role:'title', showInList:true },
        { key:'leader', label:'作业负责人', type:'text', role:'', showInList:false, remember:true },
        { key:'startTime', label:'计划开始', type:'time', role:'', showInList:false },
        { key:'hours', label:'作业时长(小时)', type:'number', role:'', showInList:false },
        { key:'reportTo', label:'报备对象', type:'text', role:'', showInList:false, def:'李冬龙', remember:true },
        { key:'remark', label:'备注', type:'textarea', role:'', showInList:false }
      ]
    },
    {
      id: 'm_repair', name: '集中修跟踪', icon: '修', desc: '当天完成 · 报肖静/王艳艳',
      enabled: true, coverage: false, order: 3,
      fields: [
        { key:'workDate', label:'日期', type:'date', required:true, role:'date', showInList:true },
        { key:'station', label:'站点', type:'station', required:true, role:'station', showInList:true },
        { key:'project', label:'作业项目', type:'text', required:true, role:'title', showInList:true },
        { key:'status', label:'完成情况', type:'select', options:['已完成','进行中','未完成'], role:'badge', showInList:true },
        { key:'reportTo', label:'报备对象', type:'text', role:'', showInList:false, def:'肖静、王艳艳', remember:true },
        { key:'remark', label:'存在问题/备注', type:'textarea', role:'', showInList:false }
      ]
    },
    {
      id: 'm_weekly', name: '周监测小结', icon: '周', desc: '每周五上传',
      enabled: true, coverage: false, order: 4,
      fields: [
        { key:'weekDate', label:'日期', type:'date', required:true, role:'date', showInList:true },
        { key:'title', label:'标题', type:'text', required:true, role:'title', showInList:true, def:'本周监测小结' },
        { key:'content', label:'小结内容', type:'textarea', required:true, role:'', showInList:false },
        { key:'status', label:'上传状态', type:'select', options:['已上传','未上传'], role:'badge', showInList:true },
        { key:'author', label:'填报人', type:'text', role:'', showInList:false, remember:true }
      ]
    },
    {
      id: 'm_study', name: '文件学习摘录', icon: '学', desc: '段重点文件片段',
      enabled: true, coverage: false, order: 5,
      fields: [
        { key:'studyDate', label:'日期', type:'date', required:true, role:'date', showInList:true },
        { key:'docName', label:'文件名称', type:'text', required:true, role:'title', showInList:true },
        { key:'category', label:'分类', type:'select', options:['安全','施工','监测','设备','其他'], role:'badge', showInList:true },
        { key:'excerpt', label:'重点片段摘录', type:'textarea', required:true, role:'', showInList:false },
        { key:'author', label:'摘录人', type:'text', role:'', showInList:false, remember:true }
      ]
    }
  ]
};
