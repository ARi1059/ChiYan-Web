import { useApp } from "../store/AppContext";
import { cn } from "../components/ui/utils";
import type { DisplayConfig } from "../data/models";
import { DEFAULT_MODELS, DEFAULT_SETTINGS, DEFAULT_DISPLAY } from "../data/models";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 mt-5 first:mt-0">
      {children}
    </p>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 bg-card rounded-[12px] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <span className="text-sm text-foreground flex-shrink-0 pt-0.5 w-24">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between bg-card rounded-[12px] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          "w-12 h-6 rounded-full relative transition-colors duration-200 flex-shrink-0",
          value ? "bg-primary" : "bg-secondary"
        )}
      >
        <span
          className={cn(
            "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200",
            value ? "translate-x-7" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

export function SettingsTab() {
  const { settings, display, updateSettings, updateDisplay, setModels } = useApp();

  const handleReset = () => {
    setModels(DEFAULT_MODELS);
    updateSettings(DEFAULT_SETTINGS);
    updateDisplay(DEFAULT_DISPLAY);
  };

  return (
    <div className="p-5 pb-10">
      <SectionTitle>机构信息</SectionTitle>
      <div className="space-y-1.5">
        <TextField
          label="机构名称"
          value={settings.agencyName}
          onChange={(v) => updateSettings({ agencyName: v })}
          placeholder="赤颜"
        />
        <TextField
          label="副标语"
          value={settings.agencySlogan}
          onChange={(v) => updateSettings({ agencySlogan: v })}
          placeholder="专业模特经纪…"
        />
        <TextField
          label="经纪人 QQ"
          value={settings.agencyQQ}
          onChange={(v) => updateSettings({ agencyQQ: v })}
          placeholder="QQ 号"
        />
        <TextField
          label="QQ 群号"
          value={settings.agencyQQGroup}
          onChange={(v) => updateSettings({ agencyQQGroup: v })}
          placeholder="群号"
        />
        <TextField
          label="营业时间"
          value={settings.businessHours}
          onChange={(v) => updateSettings({ businessHours: v })}
          placeholder="每日 10:00 – 22:00"
        />
      </div>

      <SectionTitle>首页公告</SectionTitle>
      <div className="space-y-1.5">
        <Toggle
          label="显示公告"
          value={settings.noticeEnabled}
          onChange={(v) => updateSettings({ noticeEnabled: v })}
        />
        {settings.noticeEnabled && (
          <TextField
            label="公告内容"
            value={settings.homeNotice}
            onChange={(v) => updateSettings({ homeNotice: v })}
            placeholder="今日公告内容…"
            multiline
          />
        )}
      </div>

      <SectionTitle>前端展示字段</SectionTitle>
      <div className="space-y-1.5">
        <Toggle
          label="显示胸围"
          value={display.showBust}
          onChange={(v) => updateDisplay({ showBust: v })}
        />
        <Toggle
          label="显示年龄"
          value={display.showAge}
          onChange={(v) => updateDisplay({ showAge: v })}
        />
        <Toggle
          label="显示所在区"
          value={display.showDistrict}
          onChange={(v) => updateDisplay({ showDistrict: v })}
        />
        <Toggle
          label="显示风格标签"
          value={display.showStyles}
          onChange={(v) => updateDisplay({ showStyles: v })}
        />
        <Toggle
          label="显示个人简介"
          value={display.showDescription}
          onChange={(v) => updateDisplay({ showDescription: v })}
        />
        <Toggle
          label="显示 QQ 号"
          description="开启后模特卡片将显示 QQ 号"
          value={display.showQQNumber}
          onChange={(v) => updateDisplay({ showQQNumber: v })}
        />
      </div>

      <SectionTitle>后台安全</SectionTitle>
      <div className="space-y-1.5">
        <TextField
          label="管理密码"
          value={settings.adminPin}
          onChange={(v) => updateSettings({ adminPin: v })}
          placeholder="4位数字密码"
        />
      </div>

      <SectionTitle>危险操作</SectionTitle>
      <button
        onClick={handleReset}
        className="w-full py-3 rounded-[12px] border border-destructive/40 text-destructive text-sm"
      >
        重置为默认数据
      </button>
    </div>
  );
}
