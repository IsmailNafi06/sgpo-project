package sgpo.entities;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "shared_path")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SharedPath {

    @Id
    private String id;

    @Column(unique = true, nullable = false)
    private String token;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String cheminJson;

    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        this.id = java.util.UUID.randomUUID().toString();
        this.token = java.util.UUID.randomUUID().toString().substring(0, 8);
        this.createdAt = LocalDateTime.now();
    }
}