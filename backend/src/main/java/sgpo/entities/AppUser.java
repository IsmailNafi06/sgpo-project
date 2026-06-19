package sgpo.entities;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Entity
@Table(name = "app_user")
@Data
public class AppUser {
    @Id
    private String id;

    @Column(unique = true, nullable = false)
    private String username;

    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String role; // ADMIN

    private boolean enabled = true;

    @Column(nullable = false, columnDefinition = "boolean default true")
    private boolean passwordMustChange = true;

    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        this.id = java.util.UUID.randomUUID().toString();
        this.createdAt = LocalDateTime.now();
    }
}
